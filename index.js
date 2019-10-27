/**
 * (C) 2013 Sazze, Inc.
 * MIT LICENCE
 *
 * Based on a gist by mbrevoort.
 * Available at: https://gist.github.com/mbrevoort/5848179
 *
 * Inspired by winston-logstash
 * Available at: https://github.com/jaakkos/winston-logstash
 */

// Really simple Winston Logstash UDP Logger

const dgram = require("dgram"),
  os = require("os"),
  winston = require("winston"),
  Transport = require("winston-transport"),
  fastq = require("fastq"),
  ReDNS = require("redns"),
  debug = require("debug")("winston-logstash-udp");

const { LEVEL } = require("triple-beam");

const NOOP = () => {};

const redns = new ReDNS();

class Sender {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    this.client = null;

    this.queue = fastq(this, this._send, 1);
  }

  _connect() {
    this.client = dgram.createSocket({
      type: "udp4",
      lookup: redns.lookup.bind(redns)
    });

    // Attach an error listener on the socket
    // It can also avoid top level exceptions like UDP DNS errors thrown by the socket
    this.client.on("error", function(err) {
      debug("dgram error", err);
      // in node versions <= 0.12, the error event is emitted even when a callback is passed to send()
      // we always pass a callback to send(), so it's safe to do nothing here
    });
  }

  shutdown() {
    // eventually all messages will be processed and this queue will be drained
    // and then we can cleanly shutdown
    //
    // NOTICE: we are listening to drain and not empty, since empty is called imeediatly after we call the last item and don't guarantee it's finished
    // drain is called after all jobs is processed.
    this.queue.drain = this._closeClient.bind(this);
  }

  forceShutdown() {
    this.queue.killAndDrain();
    this._closeClient();
  }

  send(message, callback = NOOP) {
    this.queue.push(message, callback);
  }

  _send(message, callback) {
    var buf = Buffer.from(message.replace(/\s+$/, "") + os.EOL);

    if (!this.client) this._connect();
    this.client.send(buf, 0, buf.length, this.port, this.host, callback);
  }

  _closeClient() {
    if (this.client === null) return;

    this.client.close();
    this.client.unref();

    this.client = null;
  }
}

class LogstashUDP extends Transport {
  constructor(options) {
    super(options);
    this.name = "elasticsearch";

    options = options || {};

    this.name = "logstashUdp";
    this.level = options.level || "info";
    this.host = options.host || "127.0.0.1";
    this.port = options.port || 5043;
    this.connFlushInterval =
      options.connFlushInterval && options.connFlushInterval >= 10000
        ? options.connFlushInterval
        : 10000;

    // prepare default meta object
    this.meta_defaults = Object.assign(options.meta || {}, {
      host: os.hostname(),
      application: options.appName || process.title
    });

    // we want to avoid copy-by-reference for meta defaults, so make sure it's a flat object.
    for (var property in this.meta_defaults) {
      if (typeof this.meta_defaults[property] === "object") {
        delete this.meta_defaults[property];
      }
    }

    this._refreshSenderLoop();
  }

  _refreshSenderLoop() {
    if (this.sender) {
      // clear the last sender
      this.sender.shutdown();
    }

    // refresh sender every specified interval to avoid stale connections
    // just swap senders, and the old will clean eventually
    this.sender = new Sender(this.host, this.port);

    this._refreshTimeoutId = setTimeout(
      () => this._refreshSenderLoop(),
      this.connFlushInterval
    );
  }

  shutdown() {
    if (this._refreshTimeoutId) {
      clearTimeout(this._refreshTimeoutId);
    }

    if (this.sender) {
      this.sender.forceShutdown();
    }
  }

  log(info, callback = NOOP) {
    if (this.silent) {
      return callback(null, true);
    }

    try {
      const logMessage = this._buildLog(info);

      this.sender.send(logMessage, err => {
        if (err) {
          debug("received error while sending log", err);
          this.emit("warn", err);
        } else {
          this.emit("logged", info);
        }
        callback();
      });
    } catch (error) {
      debug("failed sending log", error);
    }
  }

  _buildLog(info) {
    const meta = Object.assign({}, info, this.meta_defaults);

    const data = {
      ...meta,
      "@version": "1",
      "@timestamp": new Date().toISOString(),
      level: info[LEVEL],
      message: info.message
    };

    return JSON.stringify(data);
  }
}

//
// Define a getter so that `winston.transports.LogstashUDP`
// is available and thus backwards compatible.
//
winston.transports.LogstashUDP = LogstashUDP;

module.exports = LogstashUDP;
