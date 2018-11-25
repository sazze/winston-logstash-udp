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
  util = require("util"),
  winston = require("winston"),
  Transport = require("winston-transport");

const { LEVEL, SPLAT } = require("triple-beam");

const NOOP = () => {};

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

    // non options parameters
    this.client = null;
    this.host_ip = this.host;

    this._flushConnLoop();
  }

  _flushConnLoop() {
    // get ip address, which will stay static until next reconnect (to avoid overloading DNS server)
    dns.lookup(this.host, (err, ip) => {
      this.host_ip = err ? this.host : ip;

      // flush connection every specified interval to avoid stale connections
      setTimeout(() => {
        try {
          this.client.close();
        } catch (e) {
        } finally {
          this.client = null;
        }
        this._flushConnLoop();
      }, this.connFlushInterval);
    });
  }

  connect() {
    this.client = dgram.createSocket("udp4");

    // Attach an error listener on the socket
    // It can also avoid top level exceptions like UDP DNS errors thrown by the socket
    this.client.on("error", function(err) {
      // in node versions <= 0.12, the error event is emitted even when a callback is passed to send()
      // we always pass a callback to send(), so it's safe to do nothing here
    });
  }

  log(info, callback) {
    callback = callback || NOOP;

    if (this.silent) {
      return callback(null, true);
    }

    this.sendLog(this._buildLog(info), err => {
      if (err) {
        this.emit("warn", err);
      } else {
        this.emit("logged", info);
      }
      callback();
    });
  }

  _buildLog(info) {
    const splat = (info[SPLAT] || []).reduce((acc, value) => {
      if(value !== null && typeof value === 'object') {
        return Object.assign(acc, value)
      }

			return acc;
    }, {});

    const meta = Object.assign({}, splat || {}, this.meta_defaults);

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
    var buf = Buffer.from(message.replace(/\s+$/, "") + os.EOL);
    callback = callback || NOOP;

    if (!this.client) this.connect();
    this.client.send(buf, 0, buf.length, this.port, this.host_ip, callback);
  }
}

//
// Define a getter so that `winston.transports.LogstashUDP`
// is available and thus backwards compatible.
//
winston.transports.LogstashUDP = LogstashUDP;

module.exports = LogstashUDP;
