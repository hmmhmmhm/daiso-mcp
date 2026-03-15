/*
 * GS25 pangle 직접 TLS 경로 리플레이 후커
 *
 * 목적:
 * - SSL_write 직전 plaintext HTTP 요청에서 pangle get_ads 요청을 식별
 * - 요청 헤더/바디를 구조화 로그(JSON)로 덤프
 * - 선택적으로 body(hex)를 교체해 네트워크 직전 리플레이 실험 수행
 *
 * 환경변수:
 * - PANGLE_REPLAY_BODY_HEX: 교체할 HTTP body(hex). 비어 있으면 덤프 전용
 * - PANGLE_HOST_FILTER: 기본 "pangle.io,pangolin-sdk-toutiao.com,tiktokpangle.us"
 */
/* global Process, Module, Interceptor, Memory, NativeFunction, ptr, console, setImmediate */

'use strict';

(function () {
  var LOG_LIMIT = 5000;
  var logCount = 0;
  var sslToHost = Object.create(null);
  var sslToFd = Object.create(null);
  var fdToPeer = Object.create(null);
  var hooked = Object.create(null);
  var sslGetFdFn = null;

  function emit(event) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    console.log('[GS25_PANGLE_DIRECT] ' + JSON.stringify(event));
  }

  function ptrKey(p) {
    try {
      return p.toString();
    } catch {
      return '<ptr-error>';
    }
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
      if (addr) return { name: nameList[i], addr: addr, module: 'global' };
    }

    var mods = Process.enumerateModules();
    for (var m = 0; m < mods.length; m += 1) {
      var mn = mods[m].name.toLowerCase();
      if (
        mn.indexOf('ssl') < 0 &&
        mn.indexOf('cronet') < 0 &&
        mn.indexOf('boring') < 0 &&
        mn.indexOf('ttnet') < 0
      ) {
        continue;
      }
      for (i = 0; i < nameList.length; i += 1) {
        try {
          addr = mods[m].getExportByName(nameList[i]);
        } catch {
          addr = null;
        }
        if (addr) return { name: nameList[i], addr: addr, module: mods[m].name };
      }
    }
    return null;
  }

  function getAllExports(nameList) {
    var out = [];
    var seen = Object.create(null);

    function pushOne(name, addr, moduleName) {
      if (!addr) return;
      var k = ptrKey(addr);
      if (seen[k]) return;
      seen[k] = true;
      out.push({ name: name, addr: addr, module: moduleName });
    }

    for (var i = 0; i < nameList.length; i += 1) {
      try {
        var g = Module.findExportByName(null, nameList[i]);
        pushOne(nameList[i], g, 'global');
      } catch {
        // ignore
      }
    }

    var mods = Process.enumerateModules();
    for (var m = 0; m < mods.length; m += 1) {
      var mn = mods[m].name.toLowerCase();
      if (
        mn.indexOf('ssl') < 0 &&
        mn.indexOf('cronet') < 0 &&
        mn.indexOf('boring') < 0 &&
        mn.indexOf('ttnet') < 0
      ) {
        continue;
      }
      for (var j = 0; j < nameList.length; j += 1) {
        try {
          var a = mods[m].getExportByName(nameList[j]);
          pushOne(nameList[j], a, mods[m].name);
        } catch {
          // ignore
        }
      }
    }
    return out;
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

  function readCStringSafe(p) {
    try {
      if (!p || p.isNull()) return '';
      return Memory.readCString(p);
    } catch {
      return '';
    }
  }

  function parseSockaddr(addr) {
    try {
      if (!addr || addr.isNull()) return null;
      var family = Memory.readU16(addr);
      if (family !== 2) return null;
      var p1 = Memory.readU8(addr.add(2));
      var p2 = Memory.readU8(addr.add(3));
      var port = ((p1 << 8) | p2) >>> 0;
      var b1 = Memory.readU8(addr.add(4));
      var b2 = Memory.readU8(addr.add(5));
      var b3 = Memory.readU8(addr.add(6));
      var b4 = Memory.readU8(addr.add(7));
      return { family: 'AF_INET', ip: b1 + '.' + b2 + '.' + b3 + '.' + b4, port: port };
    } catch {
      return null;
    }
  }

  function getEnv(name, fallback) {
    try {
      var getenvPtr = Module.findExportByName(null, 'getenv');
      if (!getenvPtr) return fallback;
      var getenvFn = new NativeFunction(getenvPtr, 'pointer', ['pointer']);
      var keyPtr = Memory.allocUtf8String(name);
      var outPtr = getenvFn(keyPtr);
      if (!outPtr || outPtr.isNull()) return fallback;
      var value = Memory.readCString(outPtr);
      if (!value) return fallback;
      return value;
    } catch {
      return fallback;
    }
  }

  function bytesToHex(bytes, limit) {
    var n = bytes.length;
    if (limit > 0 && n > limit) n = limit;
    var out = new Array(n);
    for (var i = 0; i < n; i += 1) {
      var h = bytes[i].toString(16);
      out[i] = h.length === 1 ? '0' + h : h;
    }
    return out.join('');
  }

  function bytesToAscii(bytes, limit) {
    var n = bytes.length;
    if (limit > 0 && n > limit) n = limit;
    var s = '';
    for (var i = 0; i < n; i += 1) {
      var c = bytes[i];
      s += c >= 32 && c <= 126 ? String.fromCharCode(c) : '.';
    }
    return s;
  }

  function asciiToBytes(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  function hexToBytes(hex) {
    if (!hex) return null;
    var h = ('' + hex).replace(/\s+/g, '').toLowerCase();
    if (h.length === 0 || h.length % 2 !== 0) return null;
    if (!/^[0-9a-f]+$/.test(h)) return null;
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < h.length; i += 2) {
      out[i / 2] = parseInt(h.slice(i, i + 2), 16);
    }
    return out;
  }

  function findHeaderEnd(bytes) {
    for (var i = 0; i + 3 < bytes.length; i += 1) {
      if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) {
        return i + 4;
      }
    }
    return -1;
  }

  function parseRequest(bytes) {
    var headEnd = findHeaderEnd(bytes);
    if (headEnd < 0) return null;

    var headStr = bytesToAscii(bytes.slice(0, headEnd), 1000000);
    var lines = headStr.split('\r\n');
    if (lines.length === 0) return null;

    var first = lines[0] || '';
    var parts = first.split(' ');
    if (parts.length < 2) return null;

    var method = parts[0] || '';
    var path = parts[1] || '';
    var headers = Object.create(null);
    for (var i = 1; i < lines.length; i += 1) {
      var ln = lines[i];
      if (!ln) continue;
      var idx = ln.indexOf(':');
      if (idx <= 0) continue;
      var k = ln.slice(0, idx).trim().toLowerCase();
      var v = ln.slice(idx + 1).trim();
      headers[k] = v;
    }

    var body = bytes.slice(headEnd);
    return {
      headEnd: headEnd,
      method: method,
      path: path,
      headers: headers,
      body: body,
    };
  }

  function isTargetHost(host, filters) {
    if (!host) return false;
    var l = host.toLowerCase();
    for (var i = 0; i < filters.length; i += 1) {
      if (l.indexOf(filters[i]) >= 0) return true;
    }
    return false;
  }

  function buildRequestBytes(req, newBody) {
    var lines = [];
    lines.push(req.method + ' ' + req.path + ' HTTP/1.1');

    var hasContentLength = false;
    var keys = Object.keys(req.headers);
    for (var i = 0; i < keys.length; i += 1) {
      var k = keys[i];
      if (k === 'content-length') {
        hasContentLength = true;
        lines.push('content-length: ' + newBody.length);
      } else {
        lines.push(k + ': ' + req.headers[k]);
      }
    }
    if (!hasContentLength) {
      lines.push('content-length: ' + newBody.length);
    }
    lines.push('');
    lines.push('');

    var headBytes = asciiToBytes(lines.join('\r\n'));
    var out = new Uint8Array(headBytes.length + newBody.length);
    out.set(headBytes, 0);
    out.set(newBody, headBytes.length);
    return out;
  }

  function hookConnectAndTls() {
    var connectExp = getExport(['connect']);
    if (connectExp) {
      attachOnce('connect', connectExp.addr, {
        onEnter: function (args) {
          this.fd = args[0].toInt32();
          this.sa = parseSockaddr(args[1]);
        },
        onLeave: function () {
          if (!this.sa) return;
          fdToPeer['' + this.fd] = this.sa;
        },
      });
      emit({ t: 'hook_ok', target: 'connect', module: connectExp.module, name: connectExp.name });
    }

    var sniExp = getExport(['SSL_set_tlsext_host_name', 'SSL_set1_host']);
    if (sniExp) {
      attachOnce('sni', sniExp.addr, {
        onEnter: function (args) {
          var ssl = ptrKey(args[0]);
          var host = readCStringSafe(args[1]);
          if (!host) return;
          sslToHost[ssl] = host;
        },
      });
      emit({ t: 'hook_ok', target: 'SSL_set_tlsext_host_name', module: sniExp.module, name: sniExp.name });
    }

    var setfdExp = getExport(['SSL_set_fd']);
    if (setfdExp) {
      attachOnce('setfd', setfdExp.addr, {
        onEnter: function (args) {
          sslToFd[ptrKey(args[0])] = args[1].toInt32();
        },
      });
      emit({ t: 'hook_ok', target: 'SSL_set_fd', module: setfdExp.module, name: setfdExp.name });
    }

    var getfdExp = getExport(['SSL_get_fd']);
    if (getfdExp) {
      try {
        sslGetFdFn = new NativeFunction(getfdExp.addr, 'int', ['pointer']);
      } catch {
        sslGetFdFn = null;
      }
    }
  }

  function maybeProcessPangleWrite(ctx, args, bufPtr, len, replayBodyBytes, hostFilter) {
    if (!len || len <= 0) return;
    var host = sslToHost[ctx.ssl] || '';
    var fd = sslToFd[ctx.ssl];
    if ((fd === undefined || fd === null) && sslGetFdFn) {
      try {
        fd = sslGetFdFn(ctx.sslPtr);
        sslToFd[ctx.ssl] = fd;
      } catch {
        // ignore
      }
    }
    var peer = fd !== undefined ? fdToPeer['' + fd] : null;

    if (!isTargetHost(host, hostFilter)) return;

    var bytes;
    try {
      bytes = new Uint8Array(Memory.readByteArray(bufPtr, len));
    } catch {
      return;
    }

    var req = parseRequest(bytes);
    if (!req) {
      emit({
        t: 'pangle_write_raw',
        ts: Date.now(),
        ssl: ctx.ssl,
        fd: fd !== undefined ? fd : null,
        host: host || null,
        peer: peer || null,
        bytes: len,
        hexHead: bytesToHex(bytes, 240),
        asciiHead: bytesToAscii(bytes, 240),
        ioFn: ctx.ioFn || 'unknown',
      });
      return;
    }
    if (req.path.indexOf('/api/ad/union/sdk/get_ads/') < 0) return;

    emit({
      t: 'pangle_req',
      ts: Date.now(),
      ssl: ctx.ssl,
      fd: fd !== undefined ? fd : null,
      host: host || null,
      peer: peer || null,
      method: req.method,
      path: req.path,
      bodyLen: req.body.length,
      bodyHexHead: bytesToHex(req.body, 120),
      bodyAsciiHead: bytesToAscii(req.body, 120),
      replayConfigured: !!replayBodyBytes,
      ioFn: ctx.ioFn || 'unknown',
    });

    if (!replayBodyBytes) return;
    var outBytes = buildRequestBytes(req, replayBodyBytes);
    var outBuf = Memory.alloc(outBytes.length);
    Memory.writeByteArray(outBuf, outBytes);
    args[1] = outBuf;
    args[2] = ptr(outBytes.length);
    ctx.replaced = true;
    ctx.oldLen = len;
    ctx.newLen = outBytes.length;
  }

  function hookSslWrite() {
    var hostFilter = getEnv(
      'PANGLE_HOST_FILTER',
      'pangle.io,pangolin-sdk-toutiao.com,tiktokpangle.us',
    )
      .split(',')
      .map(function (s) {
        return (s || '').trim().toLowerCase();
      })
      .filter(function (s) {
        return s.length > 0;
      });
    var replayBodyHex = getEnv('PANGLE_REPLAY_BODY_HEX', '');
    var replayBodyBytes = hexToBytes(replayBodyHex);
    var targets = getAllExports(['SSL_write', 'SSL_write_ex']);
    if (targets.length === 0) {
      emit({ t: 'hook_fail', target: 'SSL_write/SSL_write_ex' });
      return;
    }
    for (var i = 0; i < targets.length; i += 1) {
      (function (exp) {
        attachOnce('ssl_write_any', exp.addr, {
          onEnter: function (args) {
            this.sslPtr = args[0];
            this.ssl = ptrKey(args[0]);
            this.replaced = false;
            this.ioFn = exp.name;
            if (exp.name === 'SSL_write_ex') {
              // int SSL_write_ex(ssl, buf, num, *written)
              this.bufPtr = args[1];
              this.len = Number(args[2]);
              maybeProcessPangleWrite(this, args, this.bufPtr, this.len, replayBodyBytes, hostFilter);
              return;
            }
            // int SSL_write(ssl, buf, num)
            this.bufPtr = args[1];
            this.len = args[2].toInt32();
            maybeProcessPangleWrite(this, args, this.bufPtr, this.len, replayBodyBytes, hostFilter);
          },
          onLeave: function (retval) {
            if (!this.replaced) return;
            emit({
              t: 'pangle_req_replaced',
              ts: Date.now(),
              ssl: this.ssl,
              oldLen: this.oldLen,
              newLen: this.newLen,
              ret: retval.toInt32(),
              ioFn: this.ioFn || exp.name,
            });
          },
        });
        emit({ t: 'hook_ok', target: exp.name, module: exp.module, name: exp.name });
      })(targets[i]);
    }
  }

  function main() {
    hookConnectAndTls();
    hookSslWrite();
    emit({ t: 'ready', name: 'gs25-pangle-direct-replay-hook' });
  }

  setImmediate(main);
})();
