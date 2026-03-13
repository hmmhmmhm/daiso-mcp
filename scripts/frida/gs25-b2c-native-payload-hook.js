/*
 * GS25 b2c 네이티브 payload 후킹 스크립트
 *
 * 목적:
 * - SSL_write/SSL_read 지점에서 전송/수신 버퍼를 직접 관찰
 * - SNI, SSL_set_fd, connect 정보를 결합해 host/fd를 매핑
 * - b2c/woodongs 관련 세션의 평문 후보를 구조화 로그로 수집
 */
/* global Process, Module, Interceptor, Memory, NativeFunction, hexdump, console, setImmediate */

'use strict';

(function () {
  var LOG_LIMIT = 8000;
  var DUMP_LIMIT = 16384;
  var logCount = 0;

  var sslToHost = Object.create(null);
  var sslToFd = Object.create(null);
  var fdToPeer = Object.create(null);
  var hooked = Object.create(null);
  var unknownIoCount = 0;
  var UNKNOWN_IO_LIMIT = 200;
  var sslGetFdFn = null;

  function now() {
    return Date.now();
  }

  function emit(event) {
    if (logCount >= LOG_LIMIT) {
      return;
    }
    logCount += 1;
    console.log('[GS25_B2C_NATIVE_PAYLOAD] ' + JSON.stringify(event));
  }

  function safeReadCString(p) {
    try {
      if (!p || p.isNull()) return '';
      return Memory.readCString(p);
    } catch {
      return '';
    }
  }

  function ptrKey(p) {
    try {
      return p.toString();
    } catch {
      return '<ptr-error>';
    }
  }

  function isInterestingHost(s) {
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
    } catch {
      // ignore
    }
    return null;
  }

  function getExport(nameList) {
    var i;
    var addr;
    for (i = 0; i < nameList.length; i += 1) {
      try {
        addr = Module.findExportByName(null, nameList[i]);
      } catch {
        addr = null;
      }
      if (addr) {
        return { name: nameList[i], addr: addr, module: 'global' };
      }
    }

    var mods = Process.enumerateModules();
    for (var j = 0; j < mods.length; j += 1) {
      var mn = mods[j].name.toLowerCase();
      if (
        mn.indexOf('ssl') < 0 &&
        mn.indexOf('cronet') < 0 &&
        mn.indexOf('boring') < 0 &&
        mn.indexOf('ttnet') < 0 &&
        mn.indexOf('flutter') < 0
      ) {
        continue;
      }
      for (i = 0; i < nameList.length; i += 1) {
        try {
          addr = mods[j].getExportByName(nameList[i]);
        } catch {
          addr = null;
        }
        if (addr) {
          return { name: nameList[i], addr: addr, module: mods[j].name };
        }
      }
    }
    return null;
  }

  function hexPreview(buf, len) {
    try {
      var n = len > DUMP_LIMIT ? DUMP_LIMIT : len;
      var bytes = Memory.readByteArray(buf, n);
      var arr = new Uint8Array(bytes);
      var out = new Array(arr.length);
      for (var i = 0; i < arr.length; i += 1) {
        var h = arr[i].toString(16);
        out[i] = h.length === 1 ? '0' + h : h;
      }
      return out.join('');
    } catch {
      try {
        return hexdump(buf, { length: Math.min(len, DUMP_LIMIT), header: true, ansi: false });
      } catch {
        return '';
      }
    }
  }

  function asciiPreview(buf, len) {
    try {
      var n = len > DUMP_LIMIT ? DUMP_LIMIT : len;
      var bytes = Memory.readByteArray(buf, n);
      var arr = new Uint8Array(bytes);
      var s = '';
      for (var i = 0; i < arr.length; i += 1) {
        var c = arr[i];
        if (c >= 32 && c <= 126) {
          s += String.fromCharCode(c);
        } else {
          s += '.';
        }
      }
      return s;
    } catch {
      return '';
    }
  }

  function attachOnce(key, addr, handler) {
    if (!addr) return false;
    var k = key + ':' + ptrKey(addr);
    if (hooked[k]) return true;
    try {
      Interceptor.attach(addr, handler);
      hooked[k] = true;
      return true;
    } catch {
      return false;
    }
  }

  function hookConnect() {
    var exp = getExport(['connect']);
    if (!exp) {
      emit({ t: 'hook_fail', target: 'connect' });
      return;
    }
    attachOnce('connect', exp.addr, {
      onEnter: function (args) {
        this.fd = args[0].toInt32();
        this.sa = parseSockaddr(args[1]);
      },
      onLeave: function () {
        if (!this.sa) return;
        fdToPeer['' + this.fd] = this.sa;
      },
    });
    emit({ t: 'hook_ok', target: 'connect', module: exp.module, name: exp.name });
  }

  function hookSniAndFd() {
    var sni = getExport(['SSL_set_tlsext_host_name', 'SSL_set1_host']);
    if (sni) {
      attachOnce('sni', sni.addr, {
        onEnter: function (args) {
          var ssl = ptrKey(args[0]);
          var host = safeReadCString(args[1]);
          if (!host) return;
          sslToHost[ssl] = host;
          if (isInterestingHost(host)) {
            emit({ t: 'sni', ts: now(), ssl: ssl, host: host });
          }
        },
      });
      emit({ t: 'hook_ok', target: 'SSL_set_tlsext_host_name', module: sni.module, name: sni.name });
    } else {
      emit({ t: 'hook_fail', target: 'SSL_set_tlsext_host_name' });
    }

    var setfd = getExport(['SSL_set_fd']);
    if (setfd) {
      attachOnce('setfd', setfd.addr, {
        onEnter: function (args) {
          var ssl = ptrKey(args[0]);
          var fd = args[1].toInt32();
          sslToFd[ssl] = fd;
        },
      });
      emit({ t: 'hook_ok', target: 'SSL_set_fd', module: setfd.module, name: setfd.name });
    } else {
      emit({ t: 'hook_fail', target: 'SSL_set_fd' });
    }

    var getfd = getExport(['SSL_get_fd']);
    if (getfd) {
      try {
        sslGetFdFn = new NativeFunction(getfd.addr, 'int', ['pointer']);
        emit({ t: 'hook_ok', target: 'SSL_get_fd', module: getfd.module, name: getfd.name });
      } catch {
        sslGetFdFn = null;
        emit({ t: 'hook_fail', target: 'SSL_get_fd_newNativeFunction' });
      }
    } else {
      emit({ t: 'hook_fail', target: 'SSL_get_fd' });
    }
  }

  function hookSslIo() {
    var w = getExport(['SSL_write']);
    var r = getExport(['SSL_read']);

    if (w) {
      attachOnce('sslw', w.addr, {
        onEnter: function (args) {
          this.sslPtr = args[0];
          this.ssl = ptrKey(args[0]);
          this.buf = args[1];
          this.len = args[2].toInt32();
        },
        onLeave: function (retval) {
          var n = retval.toInt32();
          if (n <= 0) return;
          var host = sslToHost[this.ssl] || '';
          var fd = sslToFd[this.ssl];
          if ((fd === undefined || fd === null) && sslGetFdFn) {
            try {
              fd = sslGetFdFn(this.sslPtr);
              sslToFd[this.ssl] = fd;
            } catch {
              // ignore
            }
          }
          var peer = fd !== undefined ? fdToPeer['' + fd] : null;
          var hostInteresting = isInterestingHost(host);
          var peer443 = !!(peer && peer.port === 443);
          if (!(hostInteresting || peer443)) {
            if (unknownIoCount >= UNKNOWN_IO_LIMIT) return;
            unknownIoCount += 1;
            emit({
              t: 'ssl_write_unknown',
              ts: now(),
              ssl: this.ssl,
              fd: fd !== undefined ? fd : null,
              bytes: n,
              ascii: asciiPreview(this.buf, n),
              hex: hexPreview(this.buf, n),
            });
            return;
          }
          emit({
            t: 'ssl_write',
            ts: now(),
            ssl: this.ssl,
            fd: fd !== undefined ? fd : null,
            host: host || null,
            peer: peer || null,
            bytes: n,
            ascii: asciiPreview(this.buf, n),
            hex: hexPreview(this.buf, n),
          });
        },
      });
      emit({ t: 'hook_ok', target: 'SSL_write', module: w.module, name: w.name });
    } else {
      emit({ t: 'hook_fail', target: 'SSL_write' });
    }

    if (r) {
      attachOnce('sslr', r.addr, {
        onEnter: function (args) {
          this.sslPtr = args[0];
          this.ssl = ptrKey(args[0]);
          this.buf = args[1];
        },
        onLeave: function (retval) {
          var n = retval.toInt32();
          if (n <= 0) return;
          var host = sslToHost[this.ssl] || '';
          var fd = sslToFd[this.ssl];
          if ((fd === undefined || fd === null) && sslGetFdFn) {
            try {
              fd = sslGetFdFn(this.sslPtr);
              sslToFd[this.ssl] = fd;
            } catch {
              // ignore
            }
          }
          var peer = fd !== undefined ? fdToPeer['' + fd] : null;
          var hostInteresting = isInterestingHost(host);
          var peer443 = !!(peer && peer.port === 443);
          if (!(hostInteresting || peer443)) {
            if (unknownIoCount >= UNKNOWN_IO_LIMIT) return;
            unknownIoCount += 1;
            emit({
              t: 'ssl_read_unknown',
              ts: now(),
              ssl: this.ssl,
              fd: fd !== undefined ? fd : null,
              bytes: n,
              ascii: asciiPreview(this.buf, n),
              hex: hexPreview(this.buf, n),
            });
            return;
          }
          emit({
            t: 'ssl_read',
            ts: now(),
            ssl: this.ssl,
            fd: fd !== undefined ? fd : null,
            host: host || null,
            peer: peer || null,
            bytes: n,
            ascii: asciiPreview(this.buf, n),
            hex: hexPreview(this.buf, n),
          });
        },
      });
      emit({ t: 'hook_ok', target: 'SSL_read', module: r.module, name: r.name });
    } else {
      emit({ t: 'hook_fail', target: 'SSL_read' });
    }
  }

  function hookSocketIo() {
    function attachFdIo(name, isRead) {
      var exp = getExport([name]);
      if (!exp) {
        emit({ t: 'hook_fail', target: name });
        return;
      }
      attachOnce('fdio:' + name, exp.addr, {
        onEnter: function (args) {
          this.fd = args[0].toInt32();
          this.buf = args[1];
          this.req = args[2] && args[2].toInt32 ? args[2].toInt32() : 0;
        },
        onLeave: function (retval) {
          var n = retval.toInt32 ? retval.toInt32() : 0;
          if (n <= 0) return;
          var peer = fdToPeer['' + this.fd];
          if (!peer || peer.port !== 443) return;
          if (unknownIoCount >= UNKNOWN_IO_LIMIT) return;
          unknownIoCount += 1;
          emit({
            t: isRead ? 'fd_read' : 'fd_write',
            api: name,
            ts: now(),
            fd: this.fd,
            peer: peer,
            bytes: n,
            ascii: asciiPreview(this.buf, n),
            hex: hexPreview(this.buf, n),
          });
        },
      });
      emit({ t: 'hook_ok', target: name, module: exp.module, name: exp.name });
    }

    attachFdIo('send', false);
    attachFdIo('recv', true);
    attachFdIo('write', false);
    attachFdIo('read', true);
  }

  function main() {
    hookConnect();
    hookSniAndFd();
    hookSslIo();
    hookSocketIo();
    emit({ t: 'ready', ts: now(), name: 'gs25-b2c-native-payload-hook' });
  }

  setImmediate(main);
})();
