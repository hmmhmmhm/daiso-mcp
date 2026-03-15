/*
 * GS25 b2c 네이티브 SNI 최소 후킹 스크립트
 *
 * 목적:
 * - 앱 안정성을 우선하면서 TLS SNI(host)만 수집
 * - SSL_write/SSL_read 후킹 없이 SSL_set_tlsext_host_name만 관찰
 */

'use strict';

(function () {
  var hooked = Object.create(null);
  var logCount = 0;
  var LOG_LIMIT = 4000;

  function log(msg) {
    if (logCount >= LOG_LIMIT) {
      return;
    }
    logCount += 1;
    console.log(msg);
  }

  function isInterestingHost(host) {
    if (!host) {
      return false;
    }
    var l = host.toLowerCase();
    return (
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c-') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('gsretail') >= 0
    );
  }

  function tryHookExport(exp) {
    var key = exp.address.toString();
    if (hooked[key]) {
      return;
    }
    hooked[key] = true;

    Interceptor.attach(exp.address, {
      onEnter: function (args) {
        try {
          var host = Memory.readCString(args[1]);
          if (isInterestingHost(host)) {
            log('[NATIVE_SNI] host=' + host + ' ssl=' + args[0]);
          }
        } catch (e) {
          // ignore
        }
      },
    });

    log('[+] hooked SSL_set_tlsext_host_name @ ' + exp.address);
  }

  function scanAndHook() {
    var modules = Process.enumerateModules();
    for (var i = 0; i < modules.length; i += 1) {
      var m = modules[i];
      var exports = [];
      try {
        exports = m.enumerateExports ? m.enumerateExports() : [];
      } catch (e) {
        continue;
      }
      for (var j = 0; j < exports.length; j += 1) {
        var exp = exports[j];
        if (exp.name === 'SSL_set_tlsext_host_name') {
          tryHookExport(exp);
        }
      }
    }
  }

  function main() {
    scanAndHook();
    setInterval(scanAndHook, 3000);
    log('[+] gs25-b2c-native-sni-only ready');
  }

  setImmediate(main);
})();
