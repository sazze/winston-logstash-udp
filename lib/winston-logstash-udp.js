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

var dgram = require('dgram'),
    util = require('util'),
    os = require('os'),
    winston = require('winston'),
    common = require('winston/lib/winston/common'),
    cycle = require('cycle');

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

    this.client = null;

    this.connect();
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

    meta.application = self.application;
    meta.serverName = self.localhost;
    meta.pid = self.pid;

    logEntry = common.log({
        level: level,
        message: msg,
        meta: meta,
        timestamp: self.timestamp,
        json: true
    });

    self.sendLog(logEntry, function (err) {
        self.emit('logged', !err);

        callback(err, !err);
    });

};

LogstashUDP.prototype.sendLog = function(message, callback) {
    var self = this;

    if (this.trailingLineFeed === true) {
        message = message.replace(/\s+$/, '') + this.trailingLineFeedChar;
    }

    var buf = new Buffer(message);

    callback = (callback || function () {});

    self.client.send(buf, 0, buf.length, self.port, self.host, callback);
};
