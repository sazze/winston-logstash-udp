'use strict';

const Benchmark = require('benchmark');
const dgram = require('dgram');
const winston = require('winston');

require('../lib/winston-logstash-udp');
require('./winston-logstash-udp-legacy');

function createTestServer(port) {
  const server = dgram.createSocket('udp4');
  let counter = 0;

  server.on("error", function (err) {
    console.log("server error:\n" + err.stack);
    server.close();
  });

  server.on("message", function () {
    counter++;
  });

  server.bind(port);

  server.counter = () => counter;

  return server;
};

function createLogger(port) {
  return function (construct) {
    const defaultOptions = {
      port: port,
      appName: 'test',
      localhost: 'localhost',
      pid: 12345
    };

    return new (winston.Logger)({
      transports: [
        new (construct)(defaultOptions)
      ]
    });
  };
};

const suite = new Benchmark.Suite('Winston UDP Transport');

const server = createTestServer(9999);
const creator = createLogger(9999);
const logger = creator(winston.transports.LogstashUDP);

suite.add('logging with close after each', {
  defer: true,
  fn(deferred) {
    logger.log('info', 'hello world', { stream: 'sample' }, () => deferred.resolve());
  }
});

suite.on('cycle', function (event) {
  console.log('messages count', server.counter());
  console.log(String(event.target));
});

suite.on('complete', function () {
  server.close();
});

process.nextTick(() => suite.run());
