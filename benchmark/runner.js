'use strict';

var Benchmark = require('benchmark');
var dgram = require('dgram');
var winston = require('winston');

require('../lib/winston-logstash-udp');

function createTestServer(port) {
  var server = dgram.createSocket('udp4');
  var counter = 0;

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
      pid: 12345,
      timeout: 1000,
    };

    return new (winston.Logger)({
      transports: [
        new (construct)(defaultOptions)
      ]
    });
  };
};

var suite = new Benchmark.Suite('Winston UDP Transport');

var server = createTestServer(9999);
var creator = createLogger(9999);
var logger = creator(winston.transports.LogstashUDP);

suite.add('logging with close after timeout', {
  defer: true,
  fn(deferred) {
    logger.log('info', 'hello world', { stream: 'sample' }, function(err) {
      if (err) return deferred.reject();
      deferred.resolve()
    });
  }
});

suite.on('cycle', function (event) {
  console.log('messages count', server.counter());
  console.log(String(event.target));
});

suite.on('complete', function () {
  server.close();
});

process.nextTick(function(){ suite.run() });
