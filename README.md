# sqs-rpc

[![CircleCI](https://circleci.com/gh/rootstream/sqs-rpc/tree/master.svg?style=svg)](https://circleci.com/gh/rootstream/sqs-rpc/tree/master)

A minimalist's implementation of a basic Remote Procedure Call (RPC) solution based on AWS SQS queues.

AWS SQS is a very simple managed queue service that is almost infinitely scalable. Using this RPC solution you can
de-couple your NodeJS micro services and turn stateful REST apis into transient REST apis.

For information on SQS, [look here](https://aws.amazon.com/sqs/).

## usage

```bash
npm install --save @rootstream/sqs-rpc
```

Before you continue, you need to have a working SQS queue in your AWS account and have its URL ready. The queue URL
looks something like this: `https://sqs.<region>.amazonaws.com/<id>/<name>`

You can either set the environment variable `sqsrpc_config__endpoint` to this URL or pass it in code.

The API is modeled after Socket.IO's [ACKs](https://socket.io/docs/#Sending-and-getting-data-acknowledgements).

```JS
const SqsRpc = require('@rootstream/sqs-rpc);

const machine1 = new SqsRpc();
machine1.start();
machine1.on('sample-method', async (arg1, arg2) => {
  return `hello from ${arg1} ${arg2}!`;
})

const machine2 = new SqsRpc();
machine2.start();
machine2.emit(machine1.id, 'sample-method', 'from', 'machine1').then(ret => {
  console.log(ret); // prints: "hello from machine1!"
})
```

## API

### `new SqsRpc(options)`

Constructor, creates a new instance of the RPC client.

#### options

- `endpoint`: SQS url to connect to
- `timeout`: timeout for all network operations over SQS (before RPC calls are considered expired - default: 10s)
- `listeners`: maximum number of RPC methods you are trying to register over SQS (default: 10)
- `consumerOpts`: options passed to the instance of [sqs-consumer](https://github.com/bbc/sqs-consumer)

### `start()`

Starts accepting RPC jobs from the queue. This is an async method. You should `await` it. This is not reentrant!

### `emit(to, name, ...args)`

Calls into a method named `name` on registered client with id `to`.

- `to`: ID of the remote machine. Can be obtained via `.id` property on a `SqsUrl` instance
- `name`: name of the remote RPC method
- `...args`: any number of arguments passed to the remote method

This is an async method. You should `await` it. Result of the `await` is remote method's return value.

### `stop()`

Stops accepting RPC jobs from the queue. This is an async method. You should `await` it. This is not reentrant!
