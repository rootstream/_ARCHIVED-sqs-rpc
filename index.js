'use strict';

const _ = require('lodash');
const rc = require('rc');
const once = require('@rootstream/once');
const debug = require('debug')('sqsrpc:index');
const assert = require('assert');
const uniqid = require('uniqid');
const Promise = require('bluebird');
const { Consumer } = require('sqs-consumer');
const { EventEmitter2 } = require('eventemitter2');

/**
 * @class SqsRpc
 * A minimalist's implementation of basic RPC (Remote Procedure Call) over AWS SQS for NodeJS
 * AWS SQS is a very simple managed queue service that is almost infinitely scalable. Using this RPC solution you can
 * de-couple your NodeJS micro services and turn stateful REST apis into transient REST apis. Look at the README file
 * for more documentation on usage of this class
 */
class SqsRpc extends EventEmitter2 {
  constructor(opts) {
    opts = _.defaultsDeep(opts, getConfig().config);
    super({ wildcard: true, maxListeners: opts.listeners });
    this._opts = opts;
    this._id = uniqid('client-');
    this._callbacks = [];
    this._consumer = Consumer.create({
      queueUrl: this._opts.endpoint,
      handleMessage: this._consume.bind(this),
      terminateVisibilityTimeout: true,
      ...this._opts.consumerOpts,
    });
    // make sure start() and stop() are not spam-able
    this.stop = once(this._stop).bind(this);
    this.start = once(this._start).bind(this);
  }

  /**
   * Consumes a single SQS message, if this method throws, the message is put back onto the queue
   * @param {Object} message the message sent to us by the SQS queue
   * @private
   */
  async _consume(message) {
    debug('raw message: %o', message);
    // this throw if message does not have a well formatted json body
    const body = JSON.parse(_.get(message, 'Body', ''));
    const { to, from, payload } = body;
    // make sure this message is addressed to us, otherwise throw and put it back onto the queue
    assert.ok(to === this.id);
    // sanity checks
    assert.ok(from);
    assert.ok(payload && _.isObject(payload));

    const type = _.get(payload, 'type', '');
    const token = _.get(payload, 'token', 'invalid');

    if (type === 'REQ') {
      const name = _.get(payload, 'name', '');
      const args = _.get(payload, 'args', []);
      const fn = _.first(this.listeners(name));
      assert.ok(_.isFunction(fn));
      const ret = await fn.apply(this, args);
      await this._send(
        JSON.stringify({
          to: from,
          from: to,
          payload: { token, ret, type: 'ACK' },
        })
      );
    } else if (type === 'ACK') {
      assert.ok(this._callbacks[token]);
      const ret = _.get(payload, 'ret');
      this._callbacks[token](ret);
      delete this._callbacks[token];
    } else {
      debug('invalid message type: %s', type);
      assert.ok(false);
    }
  }

  /**
   * Sends a message to the underlying SQS queue
   * @param {string} message string to send to the queue
   * @private
   */
  async _send(message) {
    assert.ok(this._consumer.sqs);
    assert.ok(_.isString(message));
    await this._consumer.sqs
      .sendMessage({
        DelaySeconds: 0,
        MessageBody: message,
        QueueUrl: this._opts.endpoint,
      })
      .promise();
  }

  get id() {
    return this._id;
  }

  async emit(to, name, ...args) {
    const token = uniqid(`${this.id}-rpc-`);
    await this._send(
      JSON.stringify({
        to,
        from: this.id,
        payload: { token, name, args, type: 'REQ' },
      })
    );
    return await new Promise(resolve => {
      this._callbacks[token] = resolve;
    })
      .timeout(this._opts.timeout)
      .catch(err => {
        debug('call with token %s expired without a response: %o', token, err);
        delete this._callbacks[token];
        throw err; // re-throw to user
      });
  }

  async _start() {
    debug('starting the sqs rpc consumer');
    this._consumer.start();
  }

  async _stop() {
    debug('stopping the sqs rpc consumer');
    this._callbacks = [];
    const waitUntilStopped = new Promise(resolve => {
      this._consumer.once('stopped', resolve);
    }).timeout(this._opts.timeout);
    this._consumer.stop();
    await waitUntilStopped;
  }
}

const DEFAULT_CONFIG = {
  config: {
    endpoint: '',
    timeout: 9999,
    listeners: 10,
    consumerOpts: {
      waitTimeSeconds: 1,
    },
  },
};
const USER_CONFIG = rc('sqsrpc', DEFAULT_CONFIG);
const CONFIG = _.assign({}, DEFAULT_CONFIG, USER_CONFIG);
const getConfig = () => CONFIG;

module.exports = SqsRpc;
