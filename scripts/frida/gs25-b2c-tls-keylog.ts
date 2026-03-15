/*
 * GS25 b2c TLS 키로그 수집 스크립트
 *
 * 목적:
 * - BoringSSL/OpenSSL 계열에서 TLS key log 라인을 확보해 Wireshark 복호화에 활용
 * - SSL 객체와 SNI(host) 매핑을 함께 수집해 b2c-apigw/b2c-bff 접속 여부 확인
 *
 * 출력 포맷:
 * - [KEYLOG] <NSS key log line>
 * - [SNI] ssl=<ptr> host=<hostname>
 */

'use strict';

(function () {
  var sslToHost = Object.create(null);
  var sslToFd = Object.create(null);
  var fdToHost = Object.create(null);
  var keylogInstalled = 0;
  var hooked = Object.create(null);
  var installedCtx = Object.create(null);
  var maxLog = 5000;
  var logCount = 0;

  function log(msg) {
    if (logCount >= maxLog) {
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

  function readCStringSafe(p) {
    try {
      if (!p || p.isNull()) {
        return '';
      }
      return Memory.readCString(p);
    } catch (e) {
      return '';
    }
  }

  function findExport(names) {
    for (var i = 0; i < names.length; i += 1) {
      var name = names[i];
      var addr = null;
      try {
        if (Module.findExportByName) {
          addr = Module.findExportByName(null, name);
        } else if (Module.findGlobalExportByName) {
          addr = Module.findGlobalExportByName(name);
        }
      } catch (e) {
        addr = null;
      }
      if (addr) {
        return { name: name, addr: addr };
      }
    }
    return null;
  }

  function findExportInModule(moduleName, exportName) {
    try {
      var m = Process.getModuleByName(moduleName);
      return m.getExportByName(exportName);
    } catch (e) {
      return null;
    }
  }

  function findExportAll(names) {
    var i;
    var j;
    var addr = null;
    var modules = Process.enumerateModules();

    for (i = 0; i < names.length; i += 1) {
      addr = null;
      try {
        addr = Module.findExportByName(null, names[i]);
      } catch (e1) {
        addr = null;
      }
      if (addr) {
        return { name: names[i], addr: addr, module: 'global' };
      }
    }

    for (j = 0; j < modules.length; j += 1) {
      var mn = modules[j].name.toLowerCase();
      if (
        mn.indexOf('ssl') < 0 &&
        mn.indexOf('cronet') < 0 &&
        mn.indexOf('conscrypt') < 0 &&
        mn.indexOf('ttnet') < 0 &&
        mn.indexOf('boring') < 0
      ) {
        continue;
      }
      for (i = 0; i < names.length; i += 1) {
        addr = findExportInModule(modules[j].name, names[i]);
        if (addr) {
          return { name: names[i], addr: addr, module: modules[j].name };
        }
      }
    }
    return null;
  }

  function tryAttach(label, key, addr, cb) {
    if (!addr) return false;
    if (hooked[key]) return true;
    try {
      Interceptor.attach(addr, cb);
      hooked[key] = true;
      log('[+] ' + label + ' hook active');
      return true;
    } catch (e) {
      log('[-] ' + label + ' hook failed: ' + e);
      return false;
    }
  }

  function hookSni() {
    var sniExport = findExportAll(['SSL_set_tlsext_host_name', 'SSL_set1_host']);
    if (!sniExport) {
      log('[-] SNI export not found');
      return false;
    }

    var ok = tryAttach('SNI(' + sniExport.module + '/' + sniExport.name + ')', 'sni:' + sniExport.addr, sniExport.addr, {
      onEnter: function (args) {
        var ssl = args[0];
        var host = readCStringSafe(args[1]);
        if (!host) {
          return;
        }
        var key = ptrKey(ssl);
        sslToHost[key] = host;
        if (
          host.indexOf('woodongs.com') >= 0 ||
          host.indexOf('gsshop.com') >= 0 ||
          host.indexOf('b2c-') >= 0
        ) {
          log('[SNI] ssl=' + key + ' host=' + host);
        }
      },
    });
    return ok;
  }

  function hookServerNameReadback() {
    var getSni = findExportAll(['SSL_get_servername']);
    var getFd = findExportAll(['SSL_get_fd']);
    if (!getSni || !getFd) {
      log(
        '[-] readback exports not found: get_servername=' +
          (getSni ? getSni.module + '/' + getSni.name : 'none') +
          ', get_fd=' +
          (getFd ? getFd.module + '/' + getFd.name : 'none'),
      );
      return false;
    }

    var getServerName = new NativeFunction(getSni.addr, 'pointer', ['pointer', 'int']);
    var getSocketFd = new NativeFunction(getFd.addr, 'int', ['pointer']);

    function hookIo(name, retType) {
      var io = findExportAll([name]);
      if (!io) return false;
      return tryAttach('IO(' + io.module + '/' + io.name + ')', 'io:' + io.addr, io.addr, {
        onEnter: function (args) {
          try {
            var ssl = args[0];
            if (!ssl || ssl.isNull()) return;
            var hostPtr = getServerName(ssl, 0);
            var host = readCStringSafe(hostPtr);
            if (!host) return;
            var key = ptrKey(ssl);
            sslToHost[key] = host;
            if (interestingHost(host)) {
              var fd = getSocketFd(ssl);
              sslToFd[key] = fd;
              fdToHost['' + fd] = host;
              log('[SNI_READBACK] ssl=' + key + ' fd=' + fd + ' host=' + host + ' via=' + name);
            }
          } catch (e) {}
        },
      });
    }

    hookIo('SSL_write', 'int');
    hookIo('SSL_read', 'int');
    return true;
  }

  function hookFdBindingAndHandshake() {
    var setFdExport = findExportAll(['SSL_set_fd']);
    var doHsExport = findExportAll(['SSL_do_handshake', 'SSL_connect']);
    var getSni = findExportAll(['SSL_get_servername']);
    if (!setFdExport) {
      log('[-] SSL_set_fd export not found');
    }
    if (!doHsExport) {
      log('[-] SSL_do_handshake/SSL_connect export not found');
    }
    if (!getSni) {
      log('[-] SSL_get_servername export not found(for handshake)');
    }

    var getServerName = null;
    if (getSni) {
      getServerName = new NativeFunction(getSni.addr, 'pointer', ['pointer', 'int']);
    }

    if (setFdExport) {
      tryAttach('FD_BIND(' + setFdExport.module + '/' + setFdExport.name + ')', 'setfd:' + setFdExport.addr, setFdExport.addr, {
        onEnter: function (args) {
          this.ssl = args[0];
          this.fd = args[1].toInt32();
          var key = ptrKey(this.ssl);
          sslToFd[key] = this.fd;
        },
        onLeave: function (retval) {
          if (retval.toInt32() !== 1) return;
          try {
            var key = ptrKey(this.ssl);
            log('[FD_BIND] ssl=' + key + ' fd=' + this.fd);
          } catch (e) {}
        },
      });
    }

    if (doHsExport) {
      tryAttach('HANDSHAKE(' + doHsExport.module + '/' + doHsExport.name + ')', 'hs:' + doHsExport.addr, doHsExport.addr, {
        onEnter: function (args) {
          this.ssl = args[0];
        },
        onLeave: function (retval) {
          try {
            var ssl = this.ssl;
            var key = ptrKey(ssl);
            var fd = sslToFd[key];
            var host = '';
            if (getServerName) {
              host = readCStringSafe(getServerName(ssl, 0));
            }
            if (!host) {
              host = sslToHost[key] || '';
            } else {
              sslToHost[key] = host;
            }
            if (fd !== undefined && host) {
              fdToHost['' + fd] = host;
            }
            if (interestingHost(host) || (fd !== undefined && fdToHost['' + fd])) {
              log(
                '[HS] ssl=' +
                  key +
                  ' fd=' +
                  (fd !== undefined ? fd : -1) +
                  ' host=' +
                  (host || fdToHost['' + fd] || '?') +
                  ' rc=' +
                  retval.toInt32(),
              );
            }
          } catch (e) {}
        },
      });
    }
    return !!(setFdExport || doHsExport);
  }

  function installKeylogCallback() {
    var setCbExport = findExportAll(['SSL_CTX_set_keylog_callback']);
    var ctxNewExport = findExportAll(['SSL_CTX_new']);

    if (!setCbExport || !ctxNewExport) {
      log(
        '[-] keylog exports not found: set=' +
          (setCbExport ? setCbExport.module + '/' + setCbExport.name : 'none') +
          ', ctx_new=' +
          (ctxNewExport ? ctxNewExport.module + '/' + ctxNewExport.name : 'none'),
      );
      return false;
    }

    var setCb = new NativeFunction(setCbExport.addr, 'void', ['pointer', 'pointer']);
    var keylogCb = new NativeCallback(
      function (sslPtr, linePtr) {
        var line = readCStringSafe(linePtr);
        if (!line) {
          return;
        }
        var host = sslToHost[ptrKey(sslPtr)] || '?';
        log('[KEYLOG] host=' + host + ' line=' + line);
      },
      'void',
      ['pointer', 'pointer'],
    );

    Interceptor.attach(ctxNewExport.addr, {
      onLeave: function (retval) {
        if (!retval || retval.isNull()) {
          return;
        }
        var ctxKey = ptrKey(retval);
        if (installedCtx[ctxKey]) {
          return;
        }
        try {
          setCb(retval, keylogCb);
          installedCtx[ctxKey] = true;
          keylogInstalled += 1;
          if (keylogInstalled <= 20) {
            log('[+] keylog callback installed on ctx=' + ctxKey);
          }
        } catch (e) {
          log('[-] keylog callback install failed: ' + e);
        }
      },
    });

    Interceptor.attach(setCbExport.addr, {
      onEnter: function (args) {
        var ctx = args[0];
        var cb = args[1];
        log('[*] SSL_CTX_set_keylog_callback called: ctx=' + ptrKey(ctx) + ' cb=' + ptrKey(cb));
      },
    });

    log('[+] keylog hook active (ctx_new=' + ctxNewExport.module + '/' + ctxNewExport.name + ', set_cb=' + setCbExport.module + '/' + setCbExport.name + ')');
    return true;
  }

  function interestingHost(host) {
    if (!host) return false;
    var h = host.toLowerCase();
    return h.indexOf('woodongs.com') >= 0 || h.indexOf('gsshop.com') >= 0 || h.indexOf('b2c-') >= 0;
  }

  var scanCount = 0;
  function periodicScan() {
    scanCount += 1;
    try {
      hookSni();
      hookServerNameReadback();
      hookFdBindingAndHandshake();
      installKeylogCallback();
    } catch (e) {
      log('[-] periodic scan error: ' + e);
    }
    if (scanCount >= 45) {
      log('[*] tls hook scan finished count=' + scanCount);
      return;
    }
    setTimeout(periodicScan, 1000);
  }

  function main() {
    periodicScan();
    log('[+] gs25-b2c-tls-keylog ready');
  }

  setImmediate(main);
})();
