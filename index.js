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
  dns = require("dns"),
  os = require("os"),
  winston = require("winston"),
  Transport = require("winston-transport"),
  fastq = require('fastq'),
  debug = require("debug")("winston-logstash-udp");

const { LEVEL } = require("triple-beam");

const NOOP = () => {};

class Sender {
  constructor(host, port) {
    this.host = host;
    this.port = port;

    this.queue = fastq(this, this._send, 1);
    this.queue.empty = this._onQueueEmpty.bind(this);
  }

  _connect() {
    this.client = dgram.createSocket({
      type: 'udp4'
      // TODO: put lookup function
    });

    // Attach an error listener on the socket
    // It can also avoid top level exceptions like UDP DNS errors thrown by the socket
    this.client.on("error", function(err) {
      debug('dgram error', err);
      // in node versions <= 0.12, the error event is emitted even when a callback is passed to send()
      // we always pass a callback to send(), so it's safe to do nothing here
    });

  }

  send(message, callback = NOOP) {
    this.queue.push(message, callback);
  }

  _send(message, callback) {
    var buf = Buffer.from(message.replace(/\s+$/, "") + os.EOL);

    if (!this.client) this.connect();
    this.client.send(buf, 0, buf.length, this.port, this.host, callback);
  }

  _onQueueEmpty() {
    // queue is empty, we can shutdown cleanly
    this.client.close();
    this.client.unref();
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

    this.sender = new Sender(this.host, this.port);
    this._flushConnLoop();
  }

  async _flushConnLoop() {
    this.sender = new Sender(this.host, this.port);
    this.sender.initialize();

    // flush connection every specified interval to avoid stale connections
    setTimeout(() => this._flushConnLoop(), this.connFlushInterval);
  }

  log(info, callback = NOOP) {
    if (this.silent) {
      return callback(null, true);
    }

    try {
      this.sendLog(this._buildLog(info), err => {
        if (err) {
          debug('received error while sending log', err);
          this.emit("warn", err);
        } else {
          this.emit("logged", info);
        }
        callback();
      });
    } catch(error) {
      debug('failed sending log', error);
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

  sendLog(message, callback) {
    this.sender.send(message, callback);
  }
}

//
// Define a getter so that `winston.transports.LogstashUDP`
// is available and thus backwards compatible.
//
winston.transports.LogstashUDP = LogstashUDP;

module.exports = LogstashUDP;
