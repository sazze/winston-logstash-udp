winston-logstash-udp [![Build Status](https://travis-ci.org/sazze/winston-logstash-udp.png?branch=master)](https://travis-ci.org/sazze/winston-logstash-udp)
====================

A [Logstash][0] UDP transport for [winston][1].

Based on a [gist][2] by [mbrevoort][3] and inspired by [winston-logstash][4].

Usage
====================

### Node

Recommended method:
``` js
    var winston = require('winston'),
        LogstashUDP = require('winston-logstash-udp').LogstashUDP;

    var logger = new(winston.Logger)({
      transports: [
        new(LogstashUDP)({
          port: 9999,
          appName: 'my application name',
          host: '127.0.0.1'
        })
      ]
    });
```

Alternate method:
``` js
    var winston = require('winston');

    //
    // Requiring `winston-logstash-udp` will expose
    // `winston.transports.LogstashUDP`
    //
    require('winston-logstash-udp');

    winston.add(winston.transports.LogstashUDP, {
      port: 9999,
      appName: 'my application name',
      host: '127.0.0.1'
    });
```

### Logstash
``` ruby
    input {
      # Sample input over UDP
      udp { format => "json" port => 9999 type => "sample" }
    }
    output {
      stdout { debug => true debug_format => "json"}
    }
```

Run Tests
====================

```
  npm test
```

Troubleshooting
====================

* **I get an error when installing node packages *"ERR! Error: No compatible version found: assertion-error@'^1.0.1'"***

  If you are running a version of NodeJS less than or equal to 0.8, upgrading NPM to a version greater than or equal to 1.4.6 should solve this issue.

  ```
  npm install -g npm@~1.4.6
  ```

  Another way around is to simply avoid installing the development dependencies:

  ```
  npm install --production
  ```

====================

#### Author: [Craig Thayer](https://github.com/sazze)

#### License: MIT

See LICENSE for the full license text.

[0]: http://logstash.net/
[1]: https://github.com/flatiron/winston
[2]: https://gist.github.com/mbrevoort/5848179
[3]: https://gist.github.com/mbrevoort
[4]: https://github.com/jaakkos/winston-logstash
