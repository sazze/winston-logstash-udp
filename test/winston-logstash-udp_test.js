process.env.NODE_ENV = "test";

var chai = require("chai"),
  sinon = require("sinon"),
  sinonChai = require("sinon-chai"),
  expect = chai.expect,
  dgram = require("dgram"),
  winston = require("winston"),
  timekeeper = require("timekeeper"),
  os = require("os"),
  common = require("winston/lib/winston/common"),
  pEvent = require("p-event"),
  freezed_time = new Date(1330688329321);

chai.config.includeStack = true;
chai.should();
chai.use(sinonChai);

require("../");

describe("winston-logstash-udp transport", function() {
  var test_server,
    port = 9999;

  function createTestServer(port, onMessage) {
    var server = dgram.createSocket("udp4");

    server.on("error", function(err) {
      console.log("server error:\n" + err.stack);
      server.close();
    });

    server.on("message", onMessage);

    server.on("listening", function() {
      var address = server.address();
      console.log("server listening " + address.address + ":" + address.port);
    });

    server.bind(port);

    return server;
  }

  function createLogger(port, options) {
    return createLoggerWithTransport(port, options).logger;
  }

  function createLoggerWithTransport(port, options) {
    var defaultOptions = {
        port: port,
        appName: "test",
        localhost: "localhost",
        pid: 12345
      },
      options = options || {},
      field;

    for (field in defaultOptions) {
      if (
        defaultOptions.hasOwnProperty(field) &&
        !options.hasOwnProperty(field)
      ) {
        options[field] = defaultOptions[field];
      }
    }

    const transport = new winston.transports.LogstashUDP(options);

    return {
      logger: winston.createLogger({ transports: [transport] }),
      transport
    };
  }

  describe("with logstash server", function() {
    var test_server,
      port = 9999;

    beforeEach(() => timekeeper.freeze(freezed_time));

    it("handles non-objects in splat", async () => {
      var logger = createLogger(port);
      var expected = {
        "@version": "1",
        application: "test",
        host: os.hostname(),
        level: "info",
        message: "hello world",
      };

      const logSent = new Promise(resolve => {
        test_server = createTestServer(port, function(data) {
          resolve(data);
        });
      });

      logger.info("hello", "world", { meta_object1: true }, { meta_value2: 1 });

      const response = JSON.parse(await logSent);
      expect(response.message).to.eql('hello');
      expect(response.meta_object1).to.eql(true);
      expect(response.meta_value2).to.eql(1);
    });

    it("send logs over UDP as valid json", async () => {
      var logger = createLogger(port);
      var expected = {
        "@version": "1",
        application: "test",
        host: os.hostname(),
        level: "info",
        message: "hello world",
      };

      const logSent = new Promise(resolve => {
        test_server = createTestServer(port, function(data) {
          resolve(data);
        });
      });

      logger.info("hello world");

      const response = JSON.parse(await logSent);
      expect(response).to.have.property("@timestamp");
      delete response["@timestamp"];
      expect(response).to.be.eql(expected);
    });

    it("send logs with splat over UDP as valid json", async () => {
      var logger = createLogger(port);
      var expected = {
        "@version": "1",
        application: "test",
        host: os.hostname(),
        level: "info",
        message: "hello world",
        stream: "sample"
      };

      const logSent = new Promise(resolve => {
        test_server = createTestServer(port, function(data) {
          resolve(data);
        });
      });

      logger.log("info", "hello world", { stream: "sample" });

      const response = JSON.parse(await logSent);
      expect(response).to.have.property("@timestamp");
      delete response["@timestamp"];
      expect(response).to.be.eql(expected);
    });

    it("remove all trailing blank characters and replace them with the operating system's EOL character", async () => {
      const {logger, transport} = createLoggerWithTransport(port);

      sinon.stub(transport, '_buildLog').returns('{"what":"ever"}' + "\r\n\t ");

      const logSent = new Promise(resolve => {
        createTestServer(port, function(data) {
          resolve(data);
        });
      });

      logger.log("info", "hello world", { stream: "sample" });

      const data = await logSent;
      expect(data.toString()).to.be.eql('{"what":"ever"}' + os.EOL);
    });

    // Teardown
    afterEach(() => {
      if (test_server) {
        test_server.close(() => {});
      }

      timekeeper.reset();
      test_server = null;
    });
  });

  describe("without logstash server", function() {
    it("return an error message if UDP DNS errors occur on the socket", async () => {
      const { logger, transport } = createLoggerWithTransport(port, {
        host: "unresolvedhost"
      });

      const warning = pEvent(transport, "warn");

      logger.log("info", "hello world", { stream: "sample" });

      const resp = await warning;
      expect(resp).to.be.instanceOf(Error);
    });
  });
});
