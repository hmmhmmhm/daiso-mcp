/*
 * GS25 Frida-only Native Connect Audit
 *
 * 목적:
 * - 프록시 없이 네이티브 소켓 계층에서 호스트/연결 단서를 수집
 * - getaddrinfo/connect 호출에서 b2c/woodongs/gsshop 여부 확인
 */

'use strict';

(function () {
  var LOG_LIMIT = 8000;
  var logCount = 0;

  function log(msg) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    console.log(msg);
  }

  function safeReadCString(ptr) {
    try {
      if (!ptr || ptr.isNull()) return '';
      return Memory.readCString(ptr);
    } catch (e) {
      return '';
    }
  }

  function interestingHost(s) {
    if (!s) return false;
    var l = s.toLowerCase();
    return (
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c-') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('gsretail') >= 0
    );
  }

  function parseSockaddr(addr) {
    try {
      if (!addr || addr.isNull()) return null;
      var family = Memory.readU16(addr);
      // AF_INET
      if (family === 2) {
        var p1 = Memory.readU8(addr.add(2));
        var p2 = Memory.readU8(addr.add(3));
        var port = ((p1 << 8) | p2) >>> 0;
        var b1 = Memory.readU8(addr.add(4));
        var b2 = Memory.readU8(addr.add(5));
        var b3 = Memory.readU8(addr.add(6));
        var b4 = Memory.readU8(addr.add(7));
        return { family: 'AF_INET', ip: b1 + '.' + b2 + '.' + b3 + '.' + b4, port: port };
      }
      // AF_INET6
      if (family === 10) {
        var p6_1 = Memory.readU8(addr.add(2));
        var p6_2 = Memory.readU8(addr.add(3));
        var port6 = ((p6_1 << 8) | p6_2) >>> 0;
        return { family: 'AF_INET6', ip: '::', port: port6 };
      }
    } catch (e) {}
    return null;
  }

  function hookGetaddrinfo() {
    var ptr = null;
    try {
      if (Module.findExportByName) {
        ptr = Module.findExportByName(null, 'getaddrinfo');
      } else if (Module.findGlobalExportByName) {
        ptr = Module.findGlobalExportByName('getaddrinfo');
      } else if (Module.getGlobalExportByName) {
        ptr = Module.getGlobalExportByName('getaddrinfo');
      }
    } catch (e) {
      ptr = null;
    }
    if (!ptr) {
      log('[-] getaddrinfo export not found');
      return;
    }
    Interceptor.attach(ptr, {
      onEnter: function (args) {
        var node = safeReadCString(args[0]);
        var service = safeReadCString(args[1]);
        this.node = node;
        this.service = service;
      },
      onLeave: function (retval) {
        var rc = retval.toInt32();
        var node = this.node || '';
        if (interestingHost(node)) {
          log('[NATIVE_AUDIT] getaddrinfo node=' + node + ' service=' + (this.service || '') + ' rc=' + rc);
        }
      },
    });
    log('[+] hook getaddrinfo');
  }

  function hookAndroidGetaddrinfoForNetcontext() {
    var ptr = null;
    try {
      if (Module.findExportByName) {
        ptr = Module.findExportByName(null, 'android_getaddrinfofornetcontext');
      } else if (Module.findGlobalExportByName) {
        ptr = Module.findGlobalExportByName('android_getaddrinfofornetcontext');
      }
    } catch (e) {
      ptr = null;
    }
    if (!ptr) {
      log('[-] android_getaddrinfofornetcontext export not found');
      return;
    }
    Interceptor.attach(ptr, {
      onEnter: function (args) {
        this.node = safeReadCString(args[0]);
        this.service = safeReadCString(args[1]);
      },
      onLeave: function (retval) {
        var node = this.node || '';
        if (interestingHost(node)) {
          log(
            '[NATIVE_AUDIT] android_getaddrinfofornetcontext node=' +
              node +
              ' service=' +
              (this.service || '') +
              ' rc=' +
              retval.toInt32(),
          );
        }
      },
    });
    log('[+] hook android_getaddrinfofornetcontext');
  }

  function hookGethostbyname() {
    var ptr = null;
    try {
      if (Module.findExportByName) {
        ptr = Module.findExportByName(null, 'gethostbyname');
      } else if (Module.findGlobalExportByName) {
        ptr = Module.findGlobalExportByName('gethostbyname');
      }
    } catch (e) {
      ptr = null;
    }
    if (!ptr) {
      log('[-] gethostbyname export not found');
      return;
    }
    Interceptor.attach(ptr, {
      onEnter: function (args) {
        this.name = safeReadCString(args[0]);
      },
      onLeave: function (_retval) {
        var name = this.name || '';
        if (interestingHost(name)) {
          log('[NATIVE_AUDIT] gethostbyname name=' + name);
        }
      },
    });
    log('[+] hook gethostbyname');
  }

  function hookResNquery() {
    var ptr = null;
    try {
      if (Module.findExportByName) {
        ptr = Module.findExportByName(null, 'res_nquery');
      } else if (Module.findGlobalExportByName) {
        ptr = Module.findGlobalExportByName('res_nquery');
      }
    } catch (e) {
      ptr = null;
    }
    if (!ptr) {
      log('[-] res_nquery export not found');
      return;
    }
    Interceptor.attach(ptr, {
      onEnter: function (args) {
        this.dname = safeReadCString(args[1]);
        this.qclass = args[2].toInt32();
        this.qtype = args[3].toInt32();
      },
      onLeave: function (retval) {
        var d = this.dname || '';
        if (interestingHost(d)) {
          log(
            '[NATIVE_AUDIT] res_nquery dname=' +
              d +
              ' qclass=' +
              this.qclass +
              ' qtype=' +
              this.qtype +
              ' rc=' +
              retval.toInt32(),
          );
        }
      },
    });
    log('[+] hook res_nquery');
  }

  function hookConnect() {
    var ptr = null;
    try {
      if (Module.findExportByName) {
        ptr = Module.findExportByName(null, 'connect');
      } else if (Module.findGlobalExportByName) {
        ptr = Module.findGlobalExportByName('connect');
      } else if (Module.getGlobalExportByName) {
        ptr = Module.getGlobalExportByName('connect');
      }
    } catch (e) {
      ptr = null;
    }
    if (!ptr) {
      log('[-] connect export not found');
      return;
    }
    Interceptor.attach(ptr, {
      onEnter: function (args) {
        this.fd = args[0].toInt32();
        this.sa = parseSockaddr(args[1]);
      },
      onLeave: function (retval) {
        if (!this.sa) return;
        var port = this.sa.port;
        if (port === 443 || port === 8082) {
          log(
            '[NATIVE_AUDIT] connect fd=' +
              this.fd +
              ' ' +
              this.sa.family +
              ' ' +
              this.sa.ip +
              ':' +
              port +
              ' ret=' +
              retval.toInt32(),
          );
        }
      },
    });
    log('[+] hook connect');
  }

  function main() {
    hookGetaddrinfo();
    hookAndroidGetaddrinfoForNetcontext();
    hookGethostbyname();
    hookResNquery();
    hookConnect();
    log('[+] gs25-frida-only-native-connect-audit ready');
  }

  setImmediate(main);
})();
