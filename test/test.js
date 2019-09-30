'use strict';

const chai = require('chai');
const sinon = require('sinon');
const chaiAP = require('chai-as-promised');
const Promise = require('bluebird');
const SqsRpc = require('../index');

chai.use(chaiAP);

describe('sqs-rpc tests', () => {
  it('should always pass', () => {
    chai.assert.ok(true);
  });

  it('should be able to perform basic RPC tasks', async () => {
    const rpc1 = new SqsRpc();
    const rpc2 = new SqsRpc();
    await chai.assert.isFulfilled(rpc1.start());
    await chai.assert.isFulfilled(rpc2.start());

    const callback = sinon.fake();
    rpc1.on('sample-method', async (arg1, arg2) => {
      callback(arg1, arg2);
      return 'sample-ret';
    });

    const ret = await chai.assert.isFulfilled(rpc2.emit(rpc1.id, 'sample-method', 'arg1-test', 'arg2-test'));
    chai.assert.equal(ret, 'sample-ret');
    chai.assert.ok(callback.calledOnce);
    chai.assert.ok(callback.calledWith('arg1-test', 'arg2-test'));

    await chai.assert.isFulfilled(rpc1.stop());
    await chai.assert.isFulfilled(rpc2.stop());
  });

  it('should be able to connect and disconnect peacefully', async () => {
    const rpc1 = new SqsRpc();
    const rpc2 = new SqsRpc();
    chai.assert.notEqual(rpc1.id, rpc2.id);

    await chai.assert.isFulfilled(rpc1.start());
    await chai.assert.isFulfilled(rpc1.start());

    await chai.assert.isFulfilled(rpc2.start());
    await chai.assert.isFulfilled(rpc2.start());

    await Promise.delay(250);

    await chai.assert.isFulfilled(rpc1.stop());
    await chai.assert.isFulfilled(rpc1.stop());

    await chai.assert.isFulfilled(rpc2.stop());
    await chai.assert.isFulfilled(rpc2.stop());
  });
});
