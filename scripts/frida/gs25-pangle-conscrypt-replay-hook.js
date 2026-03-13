/*
 * GS25 pangle Conscrypt(Java) 전송 직전 후커
 *
 * 목적:
 * - com.android.org.conscrypt.NativeCrypto.SSL_write(...)에서 plaintext 요청 바이트 캡처
 * - pangle get_ads 요청 식별 시 body 덤프/선택 교체
 *
 * 환경변수:
 * - PANGLE_REPLAY_BODY_HEX: 교체할 HTTP body(hex). 비어 있으면 덤프만 수행
 * - PANGLE_HOST_FILTER: 기본 "pangle.io,pangolin-sdk-toutiao.com,tiktokpangle.us"
 * - PANGLE_PATH_FILTER: 기본 "/api/ad/union/sdk/get_ads/,/ssdk/v2/r,/api/ad/union/sdk/stats/batch/"
 * - PANGLE_REPLAY_DIRECT_MATCH_LEN: direct write 교체 대상 길이(정수)
 * - PANGLE_REPLAY_DIRECT_HEX: direct write 교체 payload(hex)
 * - PANGLE_FULL_DUMP_LEN: 해당 길이 프레임은 full hex를 로그에 포함
 */

'use strict';

Java.perform(function () {
  var LOG_LIMIT = 6000;
  var logCount = 0;
  var probeWriteCount = 0;
  var PROBE_WRITE_LIMIT = 120;
  var probeReadCount = 0;
  var PROBE_READ_LIMIT = 200;

  function emit(event) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    console.log('[GS25_PANGLE_CONSCRYPT] ' + JSON.stringify(event));
  }

  function getenv(name, fallback) {
    try {
      var System = Java.use('java.lang.System');
      var v = System.getenv(name);
      if (v === null) return fallback;
      var s = '' + v;
      return s.length > 0 ? s : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function getParam(name) {
    try {
      var p = typeof parameters !== 'undefined' ? parameters : null;
      if (!p || typeof p !== 'object') return null;
      if (!(name in p)) return null;
      var v = p[name];
      if (v === null || v === undefined) return null;
      return '' + v;
    } catch (e) {
      return null;
    }
  }

  function getConfig(name, fallback) {
    try {
      if (
        typeof globalThis !== 'undefined' &&
        globalThis.__PANGLE_CFG &&
        typeof globalThis.__PANGLE_CFG === 'object' &&
        globalThis.__PANGLE_CFG[name] !== undefined &&
        globalThis.__PANGLE_CFG[name] !== null
      ) {
        var gv = '' + globalThis.__PANGLE_CFG[name];
        if (gv.length > 0) return gv;
      }
    } catch (e) {
      // ignore
    }
    var p = getParam(name);
    if (p !== null && p.length > 0) return p;
    return getenv(name, fallback);
  }

  function hexToBytes(hex) {
    if (!hex) return null;
    var h = ('' + hex).replace(/\s+/g, '').toLowerCase();
    if (h.length === 0 || h.length % 2 !== 0) return null;
    if (!/^[0-9a-f]+$/.test(h)) return null;
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < h.length; i += 2) out[i / 2] = parseInt(h.slice(i, i + 2), 16);
    return out;
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
    var p = first.split(' ');
    if (p.length < 2) return null;

    var headers = {};
    for (var i = 1; i < lines.length; i += 1) {
      var ln = lines[i];
      if (!ln) continue;
      var idx = ln.indexOf(':');
      if (idx <= 0) continue;
      var k = ln.slice(0, idx).trim().toLowerCase();
      var v = ln.slice(idx + 1).trim();
      headers[k] = v;
    }
    return {
      method: p[0] || '',
      path: p[1] || '',
      headers: headers,
      body: bytes.slice(headEnd),
    };
  }

  function buildRequestBytes(req, body) {
    var lines = [];
    lines.push(req.method + ' ' + req.path + ' HTTP/1.1');
    var hasLen = false;
    var keys = Object.keys(req.headers);
    for (var i = 0; i < keys.length; i += 1) {
      var k = keys[i];
      if (k === 'content-length') {
        hasLen = true;
        lines.push('content-length: ' + body.length);
      } else {
        lines.push(k + ': ' + req.headers[k]);
      }
    }
    if (!hasLen) lines.push('content-length: ' + body.length);
    lines.push('');
    lines.push('');
    var head = asciiToBytes(lines.join('\r\n'));
    var out = new Uint8Array(head.length + body.length);
    out.set(head, 0);
    out.set(body, head.length);
    return out;
  }

  function toSignedByteArray(u8) {
    var arr = new Array(u8.length);
    for (var i = 0; i < u8.length; i += 1) {
      arr[i] = u8[i] > 127 ? u8[i] - 256 : u8[i];
    }
    return Java.array('byte', arr);
  }

  function uint8ToSignedArray(u8) {
    var arr = new Array(u8.length);
    for (var i = 0; i < u8.length; i += 1) {
      arr[i] = u8[i] > 127 ? u8[i] - 256 : u8[i];
    }
    return arr;
  }

  function sliceBytes(javaByteArray, off, len) {
    var total = javaByteArray.length;
    var st = off < 0 ? 0 : off;
    var ed = st + len;
    if (ed > total) ed = total;
    var out = new Uint8Array(ed - st);
    for (var i = st; i < ed; i += 1) {
      var b = javaByteArray[i];
      out[i - st] = b < 0 ? b + 256 : b;
    }
    return out;
  }

  function hostOk(host, filters) {
    if (!host) return false;
    var h = ('' + host).toLowerCase();
    for (var i = 0; i < filters.length; i += 1) {
      if (h.indexOf(filters[i]) >= 0) return true;
    }
    return false;
  }

  function pathOk(path, filters) {
    if (!path) return false;
    for (var i = 0; i < filters.length; i += 1) {
      if (path.indexOf(filters[i]) >= 0) return true;
    }
    return false;
  }

  function ptrFromJavaLong(v) {
    try {
      if (v === null || v === undefined) return new NativePointer('0');
      if (typeof v === 'object' && v.toString) return new NativePointer(v.toString());
      return new NativePointer(String(v));
    } catch (e) {
      return new NativePointer('0');
    }
  }

  var hostFilters = getConfig(
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
  var pathFilters = getConfig(
    'PANGLE_PATH_FILTER',
    '/api/ad/union/sdk/get_ads/,/api/ad/union/sdk/strategies/adn,/api/ad/union/sdk/settings/,/ssdk/v2/r,/api/ad/union/sdk/stats/batch/',
  )
    .split(',')
    .map(function (s) {
      return (s || '').trim();
    })
    .filter(function (s) {
      return s.length > 0;
    });

  var replayBodyBytes = hexToBytes(getConfig('PANGLE_REPLAY_BODY_HEX', ''));
  var replayDirectMatchLen = parseInt(getConfig('PANGLE_REPLAY_DIRECT_MATCH_LEN', '0'), 10);
  if (!Number.isFinite(replayDirectMatchLen)) replayDirectMatchLen = 0;
  var replayDirectBytes = hexToBytes(getConfig('PANGLE_REPLAY_DIRECT_HEX', ''));
  var replayAfterPath = getConfig('PANGLE_REPLAY_AFTER_PATH', '');
  var fullDumpLen = parseInt(getConfig('PANGLE_FULL_DUMP_LEN', '0'), 10);
  if (!Number.isFinite(fullDumpLen)) fullDumpLen = 0;
  var replayDirectCount = 0;
  var REPLAY_DIRECT_MAX = 3;
  var replayArmedByHost = {};

  var NativeCrypto = Java.use('com.android.org.conscrypt.NativeCrypto');
  var ov = NativeCrypto.SSL_write.overload(
    'long',
    'com.android.org.conscrypt.NativeSsl',
    'java.io.FileDescriptor',
    'com.android.org.conscrypt.NativeCrypto$SSLHandshakeCallbacks',
    '[B',
    'int',
    'int',
    'int',
  );

  ov.implementation = function (sslPtr, nativeSsl, fdObj, cb, bArr, off, len, timeoutMillis) {
    var host = '';
    try {
      host = nativeSsl.getRequestedServerName();
    } catch (e) {
      host = '';
    }

    if (!hostOk(host, hostFilters)) {
      return ov.call(this, sslPtr, nativeSsl, fdObj, cb, bArr, off, len, timeoutMillis);
    }

    var bytes = sliceBytes(bArr, off, len);
    var req = parseRequest(bytes);

    if (!req) {
      emit({
        t: 'write_raw',
        ts: Date.now(),
        host: host,
        len: len,
        hexHead: bytesToHex(bytes, 240),
        asciiHead: bytesToAscii(bytes, 240),
      });
      return ov.call(this, sslPtr, nativeSsl, fdObj, cb, bArr, off, len, timeoutMillis);
    }

    if (!pathOk(req.path, pathFilters)) {
      return ov.call(this, sslPtr, nativeSsl, fdObj, cb, bArr, off, len, timeoutMillis);
    }

    emit({
      t: 'pangle_req',
      ts: Date.now(),
      host: host,
      method: req.method,
      path: req.path,
      bodyLen: req.body.length,
      bodyHexHead: bytesToHex(req.body, 120),
      bodyAsciiHead: bytesToAscii(req.body, 120),
      replayConfigured: !!replayBodyBytes,
    });

    if (!replayBodyBytes) {
      return ov.call(this, sslPtr, nativeSsl, fdObj, cb, bArr, off, len, timeoutMillis);
    }

    var outBytes = buildRequestBytes(req, replayBodyBytes);
    var outArr = toSignedByteArray(outBytes);

    emit({
      t: 'pangle_req_replaced',
      ts: Date.now(),
      host: host,
      path: req.path,
      oldLen: len,
      newLen: outBytes.length,
    });

    return ov.call(this, sslPtr, nativeSsl, fdObj, cb, outArr, 0, outBytes.length, timeoutMillis);
  };

  function processRawBytes(tag, host, bytes, len) {
    var req = parseRequest(bytes);
    if (!req) {
      emit({
        t: 'write_raw',
        ts: Date.now(),
        tag: tag,
        host: host,
        len: len,
        hexHead: bytesToHex(bytes, 240),
        asciiHead: bytesToAscii(bytes, 240),
      });
      return;
    }
    if (!pathOk(req.path, pathFilters)) return;
    emit({
      t: 'pangle_req',
      ts: Date.now(),
      tag: tag,
      host: host,
      method: req.method,
      path: req.path,
      bodyLen: req.body.length,
      bodyHexHead: bytesToHex(req.body, 120),
      bodyAsciiHead: bytesToAscii(req.body, 120),
      replayConfigured: !!replayBodyBytes,
    });
    if (replayAfterPath && req.path.indexOf(replayAfterPath) >= 0) {
      replayArmedByHost[host] = (replayArmedByHost[host] || 0) + 1;
      emit({
        t: 'direct_replay_armed',
        ts: Date.now(),
        tag: tag,
        host: host,
        path: req.path,
        armedCount: replayArmedByHost[host],
      });
    }
  }

  try {
    var ovDirect = NativeCrypto.ENGINE_SSL_write_direct.overload(
      'long',
      'com.android.org.conscrypt.NativeSsl',
      'long',
      'int',
      'com.android.org.conscrypt.NativeCrypto$SSLHandshakeCallbacks',
    );
    ovDirect.implementation = function (sslPtr, nativeSsl, addr, len, cb) {
      var host = '';
      try {
        host = nativeSsl.getRequestedServerName();
      } catch (e) {
        host = '';
      }
      if (len > 0 && probeWriteCount < PROBE_WRITE_LIMIT) {
        probeWriteCount += 1;
        emit({ t: 'write_probe', tag: 'ENGINE_SSL_write_direct', ts: Date.now(), host: host || null, len: len });
      }
      if (hostOk(host, hostFilters) && len > 0) {
        try {
          if (
            replayDirectBytes &&
            replayDirectMatchLen > 0 &&
            len === replayDirectMatchLen &&
            replayDirectCount < REPLAY_DIRECT_MAX
          ) {
            var repPtr = Memory.alloc(replayDirectBytes.length);
            var repBuf = new Uint8Array(ArrayBuffer.wrap(repPtr, replayDirectBytes.length));
            repBuf.set(replayDirectBytes);
            replayDirectCount += 1;
            emit({
              t: 'direct_replay_applied',
              tag: 'ENGINE_SSL_write_direct',
              ts: Date.now(),
              host: host,
              oldLen: len,
              newLen: replayDirectBytes.length,
              count: replayDirectCount,
            });
            return ovDirect.call(
              this,
              sslPtr,
              nativeSsl,
              parseInt(repPtr.toString(), 16),
              replayDirectBytes.length,
              cb,
            );
          }

          var addrPtr = ptrFromJavaLong(addr);
          var bytes = new Uint8Array(ArrayBuffer.wrap(addrPtr, len));
          if (
            replayDirectBytes &&
            replayArmedByHost[host] > 0 &&
            replayDirectCount < REPLAY_DIRECT_MAX &&
            (replayDirectMatchLen <= 0 || len === replayDirectMatchLen)
          ) {
            var repPtrAfter = Memory.alloc(replayDirectBytes.length);
            var repBufAfter = new Uint8Array(ArrayBuffer.wrap(repPtrAfter, replayDirectBytes.length));
            repBufAfter.set(replayDirectBytes);
            replayDirectCount += 1;
            replayArmedByHost[host] -= 1;
            emit({
              t: 'direct_replay_after_path_applied',
              tag: 'ENGINE_SSL_write_direct',
              ts: Date.now(),
              host: host,
              oldLen: len,
              newLen: replayDirectBytes.length,
              count: replayDirectCount,
            });
            return ovDirect.call(
              this,
              sslPtr,
              nativeSsl,
              parseInt(repPtrAfter.toString(), 16),
              replayDirectBytes.length,
              cb,
            );
          }
          emit({
            t: 'direct_dump',
            tag: 'ENGINE_SSL_write_direct',
            ts: Date.now(),
            host: host,
            len: len,
            hexHead: bytesToHex(bytes, 240),
            asciiHead: bytesToAscii(bytes, 240),
            hexFull: fullDumpLen > 0 && len === fullDumpLen ? bytesToHex(bytes, 0) : undefined,
          });
          processRawBytes('ENGINE_SSL_write_direct', host, bytes, len);
        } catch (e) {
          emit({
            t: 'direct_read_fail',
            tag: 'ENGINE_SSL_write_direct',
            ts: Date.now(),
            host: host,
            len: len,
            addr: '' + addr,
            error: '' + e,
          });
        }
      }
      return ovDirect.call(this, sslPtr, nativeSsl, addr, len, cb);
    };
    emit({ t: 'hook_ok', target: 'ENGINE_SSL_write_direct' });
  } catch (e) {
    emit({ t: 'hook_fail', target: 'ENGINE_SSL_write_direct', error: '' + e });
  }

  try {
    var ovBioDirect = NativeCrypto.ENGINE_SSL_write_BIO_direct.overload(
      'long',
      'com.android.org.conscrypt.NativeSsl',
      'long',
      'long',
      'int',
      'com.android.org.conscrypt.NativeCrypto$SSLHandshakeCallbacks',
    );
    ovBioDirect.implementation = function (sslPtr, nativeSsl, bioPtr, addr, len, cb) {
      var host = '';
      try {
        host = nativeSsl.getRequestedServerName();
      } catch (e) {
        host = '';
      }
      if (len > 0 && probeWriteCount < PROBE_WRITE_LIMIT) {
        probeWriteCount += 1;
        emit({
          t: 'write_probe',
          tag: 'ENGINE_SSL_write_BIO_direct',
          ts: Date.now(),
          host: host || null,
          len: len,
        });
      }
      if (hostOk(host, hostFilters) && len > 0) {
        try {
          if (
            replayDirectBytes &&
            replayDirectMatchLen > 0 &&
            len === replayDirectMatchLen &&
            replayDirectCount < REPLAY_DIRECT_MAX
          ) {
            var repPtrBio = Memory.alloc(replayDirectBytes.length);
            var repBufBio = new Uint8Array(ArrayBuffer.wrap(repPtrBio, replayDirectBytes.length));
            repBufBio.set(replayDirectBytes);
            replayDirectCount += 1;
            emit({
              t: 'direct_replay_applied',
              tag: 'ENGINE_SSL_write_BIO_direct',
              ts: Date.now(),
              host: host,
              oldLen: len,
              newLen: replayDirectBytes.length,
              count: replayDirectCount,
            });
            return ovBioDirect.call(
              this,
              sslPtr,
              nativeSsl,
              bioPtr,
              parseInt(repPtrBio.toString(), 16),
              replayDirectBytes.length,
              cb,
            );
          }

          var bioAddrPtr = ptrFromJavaLong(addr);
          var bytes = new Uint8Array(ArrayBuffer.wrap(bioAddrPtr, len));
          if (
            replayDirectBytes &&
            replayArmedByHost[host] > 0 &&
            replayDirectCount < REPLAY_DIRECT_MAX &&
            (replayDirectMatchLen <= 0 || len === replayDirectMatchLen)
          ) {
            var repPtrBioAfter = Memory.alloc(replayDirectBytes.length);
            var repBufBioAfter = new Uint8Array(ArrayBuffer.wrap(repPtrBioAfter, replayDirectBytes.length));
            repBufBioAfter.set(replayDirectBytes);
            replayDirectCount += 1;
            replayArmedByHost[host] -= 1;
            emit({
              t: 'direct_replay_after_path_applied',
              tag: 'ENGINE_SSL_write_BIO_direct',
              ts: Date.now(),
              host: host,
              oldLen: len,
              newLen: replayDirectBytes.length,
              count: replayDirectCount,
            });
            return ovBioDirect.call(
              this,
              sslPtr,
              nativeSsl,
              bioPtr,
              parseInt(repPtrBioAfter.toString(), 16),
              replayDirectBytes.length,
              cb,
            );
          }
          processRawBytes('ENGINE_SSL_write_BIO_direct', host, bytes, len);
        } catch (e) {
          emit({
            t: 'direct_read_fail',
            tag: 'ENGINE_SSL_write_BIO_direct',
            ts: Date.now(),
            host: host,
            len: len,
            addr: '' + addr,
            error: '' + e,
          });
        }
      }
      return ovBioDirect.call(this, sslPtr, nativeSsl, bioPtr, addr, len, cb);
    };
    emit({ t: 'hook_ok', target: 'ENGINE_SSL_write_BIO_direct' });
  } catch (e) {
    emit({ t: 'hook_fail', target: 'ENGINE_SSL_write_BIO_direct', error: '' + e });
  }

  function inspectReadBytes(tag, host, bytes, len) {
    var ascii = bytesToAscii(bytes, 240);
    if (ascii.indexOf('HTTP/') >= 0 || ascii.indexOf('content-type') >= 0 || ascii.indexOf('{"') >= 0) {
      emit({
        t: 'read_hint',
        tag: tag,
        ts: Date.now(),
        host: host,
        len: len,
        asciiHead: ascii,
        hexHead: bytesToHex(bytes, 240),
      });
    }
  }

  try {
    var ovReadDirect = NativeCrypto.ENGINE_SSL_read_direct.overload(
      'long',
      'com.android.org.conscrypt.NativeSsl',
      'long',
      'int',
      'com.android.org.conscrypt.NativeCrypto$SSLHandshakeCallbacks',
    );
    ovReadDirect.implementation = function (sslPtr, nativeSsl, addr, len, cb) {
      var ret = ovReadDirect.call(this, sslPtr, nativeSsl, addr, len, cb);
      var host = '';
      try {
        host = nativeSsl.getRequestedServerName();
      } catch (e) {
        host = '';
      }
      var n = Number(ret);
      if (hostOk(host, hostFilters) && n > 0 && probeReadCount < PROBE_READ_LIMIT) {
        probeReadCount += 1;
        try {
          var p = ptrFromJavaLong(addr);
          var bytes = new Uint8Array(ArrayBuffer.wrap(p, n));
          inspectReadBytes('ENGINE_SSL_read_direct', host, bytes, n);
        } catch (e) {
          emit({
            t: 'direct_read_fail',
            tag: 'ENGINE_SSL_read_direct',
            ts: Date.now(),
            host: host,
            len: n,
            addr: '' + addr,
            error: '' + e,
          });
        }
      }
      return ret;
    };
    emit({ t: 'hook_ok', target: 'ENGINE_SSL_read_direct' });
  } catch (e) {
    emit({ t: 'hook_fail', target: 'ENGINE_SSL_read_direct', error: '' + e });
  }

  try {
    var ovReadBioDirect = NativeCrypto.ENGINE_SSL_read_BIO_direct.overload(
      'long',
      'com.android.org.conscrypt.NativeSsl',
      'long',
      'long',
      'int',
      'com.android.org.conscrypt.NativeCrypto$SSLHandshakeCallbacks',
    );
    ovReadBioDirect.implementation = function (sslPtr, nativeSsl, bioPtr, addr, len, cb) {
      var ret = ovReadBioDirect.call(this, sslPtr, nativeSsl, bioPtr, addr, len, cb);
      var host = '';
      try {
        host = nativeSsl.getRequestedServerName();
      } catch (e) {
        host = '';
      }
      var n = Number(ret);
      if (hostOk(host, hostFilters) && n > 0 && probeReadCount < PROBE_READ_LIMIT) {
        probeReadCount += 1;
        try {
          var p = ptrFromJavaLong(addr);
          var bytes = new Uint8Array(ArrayBuffer.wrap(p, n));
          inspectReadBytes('ENGINE_SSL_read_BIO_direct', host, bytes, n);
        } catch (e) {
          emit({
            t: 'direct_read_fail',
            tag: 'ENGINE_SSL_read_BIO_direct',
            ts: Date.now(),
            host: host,
            len: n,
            addr: '' + addr,
            error: '' + e,
          });
        }
      }
      return ret;
    };
    emit({ t: 'hook_ok', target: 'ENGINE_SSL_read_BIO_direct' });
  } catch (e) {
    emit({ t: 'hook_fail', target: 'ENGINE_SSL_read_BIO_direct', error: '' + e });
  }

  emit({
    t: 'ready',
    name: 'gs25-pangle-conscrypt-replay-hook',
    hostFilter: hostFilters,
    pathFilter: pathFilters,
    replayConfigured: !!replayBodyBytes,
    replayDirectConfigured: !!replayDirectBytes && replayDirectMatchLen > 0,
    replayDirectMatchLen: replayDirectMatchLen,
    replayAfterPath: replayAfterPath || null,
  });
});
