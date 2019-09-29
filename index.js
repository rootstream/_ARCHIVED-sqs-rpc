'use strict';

const _ = require('lodash');
const rc = require('rc');
const debug = require('debug')('sqsrpc');
const uniqid = require('uniqid');
const { Consumer } = require('sqs-consumer');

async function messageLoop(message) {
  debug('raw message: %o', message);
  try {
    const payload = JSON.parse(_.get(message, 'Body', ''));
    debug('consuming message with payload: %o', payload);
    await this._consume.call(this, payload);
  } catch (err) {
    debug('message consumption failed: %o', err);
  }
}

class SqsRpc {
  constructor(opts) {
    this._opts = _.defaultsDeep(opts, getConfig().config);
    this._id = uniqid('client');
    this._callbacks = [];
    this._consumer = Consumer.create({
      queueUrl: this._opts.endpoint,
      handleMessage: messageLoop.bind(this),
      ...this._opts.consumerOpts,
    });

    this._consumer.on('error', err => {
      debug('sqs consumer error: %o', err);
    });

    this._consumer.on('processing_error', err => {
      debug('sqs consumer processing error: %o', err);
    });

    this._consumer.on('timeout_error', err => {
      debug('sqs consumer timeout error: %o', err);
    });
  }

  async _consume(what) {
    const { to, from, payload } = JSON.parse(what);
    assert.ok(to === this._id);

    const type = _.get(payload, 'type', '');
    const token = _.get(payload, 'token', 'invalid');

    if (type === 'REQ') {
      const name = _.get(payload, 'name', '');
      const args = _.get(payload, 'args', []);
      const fn = _.first(this.listeners(name));
      assert.ok(_.isFunction(fn));
      const ret = await fn.apply(null, args);
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

  async emit(to, name, ...args) {
    const token = uniqid(this._id);
    await this._send(
      JSON.stringify({
        to,
        from: this._id,
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
      });
  }

  async _send(message) {
    await this._consumer.sqs
      .sendMessage({
        DelaySeconds: 0,
        MessageBody: message,
        QueueUrl: this._opts.endpoint,
      })
      .promise();
  }

  start() {
    this._consumer.start();
  }

  stop() {
    this._consumer.stop();
  }
}

const DEFAULT_CONFIG = {
  config: { endpoint: '', timeout: 5000, consumerOpts: { waitTimeSeconds: 1 } },
};
const USER_CONFIG = rc('sqsrpc', DEFAULT_CONFIG);
const CONFIG = _.assign({}, DEFAULT_CONFIG, USER_CONFIG);
const getConfig = () => CONFIG;

module.exports = SqsRpc;

const instance = new SqsRpc();
instance.start();
