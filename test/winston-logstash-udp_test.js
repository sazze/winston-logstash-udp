process.env.NODE_ENV = 'test';

var chai = require('chai'),
    expect = chai.expect,
    dgram = require('dgram'),
    winston = require('winston'),
    timekeeper = require('timekeeper'),
    freezed_time = new Date(1330688329321);

chai.Assertion.includeStack = true;

require('../lib/winston-logstash-udp');

describe('winston-logstash-udp transport', function () {
    var test_server, port = 9999;

    function createTestServer(port, onMessage) {
        var server = dgram.createSocket('udp4');

        server.on("error", function (err) {
            console.log("server error:\n" + err.stack);
            server.close();
        });

        server.on("message", onMessage);

        server.on("listening", function () {
            var address = server.address();
            console.log("server listening " +
                address.address + ":" + address.port);
        });

        server.bind(port);

        return server;
    }

    function createLogger(port) {
        return new (winston.Logger)({
            transports: [
                new (winston.transports.LogstashUDP)({
                    port: port,
                    appName: 'test',
                    localhost: 'localhost',
                    pid: 12345
                })
            ]
        });
    }

    describe('with logstash server', function () {
        var test_server, port = 9999;

        beforeEach(function (done) {
            timekeeper.freeze(freezed_time);
            done();
        });

        it('send logs over UDP as valid json', function (done) {
            var response;
            var logger = createLogger(port);
            var expected = {"stream": "sample", "application": "test", "serverName": "localhost", "pid": 12345, "level": "info", "message": "hello world"};

            test_server = createTestServer(port, function (data) {
                response = JSON.parse(data);
                expect(response).to.be.eql(expected);
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        // Teardown
        afterEach(function () {
            if (test_server) {
                test_server.close(function () {
                });
            }
            timekeeper.reset();
            test_server = null;
        });

    });

});