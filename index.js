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

var common = require('winston/lib/winston/common'),
    dgram = require('dgram'),
    dns = require('dns'),
    os = require('os'),
    util = require('util'),
    winston = require('winston');

var LogstashUDP = exports.LogstashUDP = function(options) {
    winston.Transport.call(this, options);
    options = options || {};

    this.name = 'logstashUdp';
    this.level = options.level || 'info';
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 5043;
    this.connFlushInterval = (options.connFlushInterval && options.connFlushInterval >= 10000) ? options.connFlushInterval : 10000;

    // prepare default meta object
    this.meta_defaults = Object.assign(options.meta || {}, {
        host: os.hostname(),
        application: options.appName || process.title
    })

    // we want to avoid copy-by-reference for meta defaults, so make sure it's a flat object.
    for (var property in this.meta_defaults) {
        if (typeof this.meta_defaults[property] === 'object') {
            delete this.meta_defaults[property];
        }
    }

    // non options parameters
    this.client = null;
    this.host_ip = this.host;

    (flushConnLoop = () => {
        // get ip address, which will stay static until next reconnect (to avoid overloading DNS server)
        dns.lookup(this.host, (err, ip) => {
            this.host_ip = (err) ? this.host : ip;

            // flush connection every specified interval to avoid stale connections
            setTimeout(() => {
                try { this.client.close(); } catch(e) {} finally { this.client = null; }
                flushConnLoop();
            }, this.connFlushInterval);
        });
    })();
};

util.inherits(LogstashUDP, winston.Transport);

//
// Define a getter so that `winston.transports.LogstashUDP`
// is available and thus backwards compatible.
//
winston.transports.LogstashUDP = LogstashUDP;

LogstashUDP.prototype.connect = function() {
    this.client = dgram.createSocket('udp4');

    // Attach an error listener on the socket
    // It can also avoid top level exceptions like UDP DNS errors thrown by the socket
    this.client.on('error', function(err) {
        // in node versions <= 0.12, the error event is emitted even when a callback is passed to send()
        // we always pass a callback to send(), so it's safe to do nothing here
    });
};

LogstashUDP.prototype.log = function(level, msg, meta, callback) {
    var logEntry;
    callback = (callback || function () {});

    if (this.silent) {
        return callback(null, true);
    }

    var meta = Object.assign({}, meta || {}, this.meta_defaults, {
        // required logstash fields
        '@timestamp': new Date().toISOString(),
        '@version': '1'
    });

    logEntry = common.log({
        level: level,
        message: msg,
        meta: meta,
        json: true
    });

    this.sendLog(logEntry, (err) => {
        this.emit('logged', !err);
        callback(err, !err);
    });

};

LogstashUDP.prototype.sendLog = function(message, callback) {
    var buf = new Buffer(message.replace(/\s+$/, '') + os.EOL);
    callback = (callback || function() {});

    if (!this.client) this.connect();
    this.client.send(buf, 0, buf.length, this.port, this.host_ip, callback);
};
