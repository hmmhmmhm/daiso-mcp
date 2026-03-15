/*
 * GS25 b2c 네이티브 네트워크 후킹 스크립트
 *
 * 목적:
 * - connect() 단에서 직접 443 연결 대상 확인
 * - 모듈별 SSL 심볼(SSL_read/SSL_write/SSL_set_tlsext_host_name) 탐색/후킹 시도
 *
 * 주의:
 * - 로그 과다를 막기 위해 woodongs/gsshop/b2c 관련 호스트 중심으로 출력
 */

'use strict';

(function () {
  var hookedAddrs = Object.create(null);
  var sslToHost = Object.create(null);
  var logLimit = 8000;
  var logCount = 0;

  function log(msg) {
    if (logCount >= logLimit) {
      return;
    }
    logCount += 1;
    console.log(msg);
  }

  function ptrKey(p) {
    try {
      return p.toString();
    } catch (e) {
      return '<ptr-error>';
    }
  }

  function hasInterestingHost(s) {
    if (!s) {
      return false;
    }
    return (
      s.indexOf('woodongs') >= 0 ||
      s.indexOf('b2c-') >= 0 ||
      s.indexOf('gsshop') >= 0 ||
      s.indexOf('gsretail') >= 0
    );
  }

  function parseSockaddr(addr) {
    try {
      if (!addr || addr.isNull()) {
        return null;
      }
      var family = Memory.readU16(addr);
      if (family === 2) {
        var port = ((Memory.readU8(addr.add(2)) << 8) | Memory.readU8(addr.add(3))) >>> 0;
        var b1 = Memory.readU8(addr.add(4));
        var b2 = Memory.readU8(addr.add(5));
        var b3 = Memory.readU8(addr.add(6));
        var b4 = Memory.readU8(addr.add(7));
        return {
          family: 'AF_INET',
          ip: b1 + '.' + b2 + '.' + b3 + '.' + b4,
          port: port,
        };
      }
      if (family === 10) {
        var pHi = Memory.readU8(addr.add(2));
        var pLo = Memory.readU8(addr.add(3));
        var p6 = ((pHi << 8) | pLo) >>> 0;
        return { family: 'AF_INET6', ip: '::', port: p6 };
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function hookConnect() {
    var connectPtr = null;
    try {
      if (Module.findExportByName) {
        connectPtr = Module.findExportByName(null, 'connect');
      } else if (Module.findGlobalExportByName) {
        connectPtr = Module.findGlobalExportByName('connect');
      } else if (Module.getGlobalExportByName) {
        connectPtr = Module.getGlobalExportByName('connect');
      }
    } catch (e) {
      connectPtr = null;
    }
    if (!connectPtr) {
      log('[-] connect export not found');
      return;
    }

    Interceptor.attach(connectPtr, {
      onEnter: function (args) {
        var sa = parseSockaddr(args[1]);
        if (!sa) {
          return;
        }
        this.__conn = sa;
      },
      onLeave: function (retval) {
        if (!this.__conn) {
          return;
        }
        if (this.__conn.port === 443 || this.__conn.port === 8082) {
          log(
            '[connect] ' +
              this.__conn.family +
              ' ' +
              this.__conn.ip +
              ':' +
              this.__conn.port +
              ' ret=' +
              retval,
          );
        }
      },
    });

    log('[+] connect hook active');
  }

  function safeReadCString(p) {
    try {
      if (!p || p.isNull()) {
        return '';
      }
      return Memory.readCString(p);
    } catch (e) {
      return '';
    }
  }

  function tryHookExport(exp) {
    var key = ptrKey(exp.address);
    if (hookedAddrs[key]) {
      return;
    }
    hookedAddrs[key] = true;

    if (exp.name === 'SSL_set_tlsext_host_name') {
      Interceptor.attach(exp.address, {
        onEnter: function (args) {
          var ssl = ptrKey(args[0]);
          var host = safeReadCString(args[1]);
          if (!host) {
            return;
          }
          sslToHost[ssl] = host;
          if (hasInterestingHost(host)) {
            log('[SNI] ssl=' + ssl + ' host=' + host);
          }
        },
      });
      log('[+] hooked ' + exp.name + ' @ ' + exp.address);
      return;
    }

    if (exp.name === 'SSL_write' || exp.name === 'SSL_read') {
      Interceptor.attach(exp.address, {
        onEnter: function (args) {
          this.ssl = ptrKey(args[0]);
          this.buf = args[1];
          this.len = args[2].toInt32 ? args[2].toInt32() : 0;
        },
        onLeave: function (retval) {
          var n = retval.toInt32 ? retval.toInt32() : 0;
          if (n <= 0) {
            return;
          }
          var host = sslToHost[this.ssl] || '?';
          if (!hasInterestingHost(host)) {
            return;
          }
          log('[' + exp.name + '] host=' + host + ' bytes=' + n);
        },
      });
      log('[+] hooked ' + exp.name + ' @ ' + exp.address);
    }
  }

  function scanAndHookSslSymbols() {
    var modules = Process.enumerateModules();
    var targetNames = {
      SSL_set_tlsext_host_name: true,
      SSL_write: true,
      SSL_read: true,
    };

    for (var i = 0; i < modules.length; i += 1) {
      var m = modules[i];
      var exports = [];
      try {
        if (m.enumerateExports) {
          exports = m.enumerateExports();
        } else if (Module.enumerateExports) {
          exports = Module.enumerateExports(m.name);
        } else {
          exports = [];
        }
      } catch (e) {
        continue;
      }
      for (var j = 0; j < exports.length; j += 1) {
        var exp = exports[j];
        if (targetNames[exp.name]) {
          tryHookExport(exp);
        }
      }
    }
  }

  function main() {
    hookConnect();
    scanAndHookSslSymbols();
    setInterval(scanAndHookSslSymbols, 3000);
    log('[+] gs25-b2c-native-net-hook ready');
  }

  setImmediate(main);
})();
