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
    cycle = require('cycle'),
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
    this.localhost = options.localhost || os.hostname();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 9999;
    this.application = options.appName || process.title;
    this.pid = options.pid || process.pid;
    this.trailingLineFeed = options.trailingLineFeed === true;
    this.trailingLineFeedChar = options.trailingLineFeedChar || os.EOL;
    this.metadata = options.metadata || {};
    this.connFlushInterval = (options.connFlushInterval && options.connFlushInterval >= 10000) ? options.connFlushInterval : 10000;

    // non options parameters
    this.client = null;
    this.host_ip = this.host;

    // reconnect every specified interval to avoid stale connections
    var self = this;
    setInterval(function() {
        // get ip address, which will stay static until next reconnect
        // this is to avoid overloading dns server
        dns.lookup(self.host, function(err, ip) {
            self.host_ip = (err) ? self.host : ip;
            try { self.client.close(); } catch(e) {} finally { self.client = null; }
        });
    }, this.connFlushInterval);
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
    var self = this,
        meta = winston.clone(cycle.decycle(meta) || {}),
        logEntry;

    callback = (callback || function () {});

    if (self.silent) {
        return callback(null, true);
    }

    meta['@timestamp'] = new Date().toISOString();
    meta['@version'] = "1";
    meta['@metadata'] = self.metadata;
    meta['application'] = self.application;
    meta['host'] = self.localhost;
    meta['pid'] = self.pid;

    logEntry = common.log({
        level: level,
        message: msg,
        meta: meta,
        json: true
    });

    self.sendLog(logEntry, function (err) {
        self.emit('logged', !err);

        callback(err, !err);
    });

};

LogstashUDP.prototype.sendLog = function(message, callback) {
    if (this.trailingLineFeed === true) {
        message = message.replace(/\s+$/, '') + this.trailingLineFeedChar;
    }

    var buf = new Buffer(message);

    callback = (callback || function () {});

    if (!this.client) this.connect();
    this.client.send(buf, 0, buf.length, this.port, this.host_ip, callback);
};
