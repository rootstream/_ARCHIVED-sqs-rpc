'use strict';

const chai = require('chai');
const chaiAP = require('chai-as-promised');

chai.use(chaiAP);

describe('sqs-rpc tests', () => {
  it('should always pass', () => {
    chai.assert.ok(true);
  });
});
