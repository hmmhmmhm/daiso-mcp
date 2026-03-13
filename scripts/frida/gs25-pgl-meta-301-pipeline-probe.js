/*
 * GS25 code=301 payload 파이프라인 추적기
 *
 * 추적 대상:
 * - FUN_0012811c
 * - FUN_0012ae64 (inner blob 생성)
 * - FUN_00117b6c (JNI byte[] 생성 직전 버퍼)
 */
/* global Process, Interceptor, Memory, ptr, console, setInterval, clearInterval */

'use strict';

(function () {
  var LOG_LIMIT = 3000;
  var logCount = 0;
  var hooksInstalled = false;
  var libnms = null;
  var seq = 0;
  var active = Object.create(null); // tid -> { seq, startedAt }
  var metaSeen = 0;

  var OFF_META = 0x39894;
  var OFF_2811C = 0x2811c;
  var OFF_2AE64 = 0x2ae64;
  var OFF_17B6C = 0x17b6c;
  // 길이가 동일한 토큰으로만 교체(기본 비활성화)
  var OVERRIDE_TOKEN = '';

  function emit(e) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    if (e && typeof e === 'object' && e.ts === undefined) e.ts = Date.now();
    console.log('[GS25_PGL_301_PIPE] ' + JSON.stringify(e));
  }

  function tid(self) {
    try {
      if (self && typeof self.threadId === 'number') return self.threadId;
    } catch {
      // ignore
    }
    try {
      return Process.getCurrentThreadId();
    } catch {
      return -1;
    }
  }

  function readBytesB64(p, n) {
    var stage = 'begin';
    try {
      if (!p || p.isNull() || n <= 0) return { b64: '', err: 'invalid-args' };
      var base = p;
      stage = 'probe-original';
      try {
        base.readU8();
      } catch {
        stage = 'strip-tag';
        var canon = stripTag(p);
        if (!canon || canon.isNull()) return { b64: '', err: 'strip-tag-failed' };
        base = canon;
        stage = 'probe-canon';
        base.readU8();
      }
      var table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      var out = '';
      stage = 'read-loop';
      for (var i = 0; i < n; i += 3) {
        var b0 = base.add(i).readU8();
        var hasB1 = i + 1 < n;
        var hasB2 = i + 2 < n;
        var b1 = hasB1 ? base.add(i + 1).readU8() : 0;
        var b2 = hasB2 ? base.add(i + 2).readU8() : 0;
        var x = (b0 << 16) | (b1 << 8) | b2;
        out += table[(x >> 18) & 0x3f];
        out += table[(x >> 12) & 0x3f];
        out += hasB1 ? table[(x >> 6) & 0x3f] : '=';
        out += hasB2 ? table[x & 0x3f] : '=';
      }
      return { b64: out, err: '' };
    } catch (e) {
      return { b64: '', err: stage + ': ' + String(e) };
    }
  }

  function stripTag(p) {
    try {
      var raw = ptr(p).toString();
      var x = BigInt(raw);
      var masked = x & 0x00ffffffffffffffn;
      return ptr('0x' + masked.toString(16));
    } catch {
      return null;
    }
  }

  function readU64Safe(p) {
    try {
      if (!p || p.isNull()) return null;
      return p.readU64().toString();
    } catch {
      return null;
    }
  }

  function readVarintAt(base, totalLen, off) {
    var x = 0;
    var shift = 0;
    var i = off;
    while (i < totalLen && i - off < 10) {
      var b = base.add(i).readU8();
      x |= (b & 0x7f) << shift;
      i += 1;
      if ((b & 0x80) === 0) return { ok: true, value: x >>> 0, next: i };
      shift += 7;
    }
    return { ok: false, value: 0, next: off };
  }

  function writeAscii(base, off, s) {
    for (var i = 0; i < s.length; i += 1) {
      base.add(off + i).writeU8(s.charCodeAt(i) & 0xff);
    }
  }

  function tryOverrideToken(inPtr, inLen) {
    try {
      if (!OVERRIDE_TOKEN || OVERRIDE_TOKEN.length === 0) return { changed: false, reason: 'override-disabled' };
      var p = stripTag(inPtr) || inPtr;
      if (!p || p.isNull()) return { changed: false, reason: 'null-ptr' };
      var i = 0;
      while (i < inLen) {
        var tag = readVarintAt(p, inLen, i);
        if (!tag.ok) return { changed: false, reason: 'bad-tag' };
        i = tag.next;
        var field = tag.value >>> 3;
        var wt = tag.value & 7;
        if (wt === 0) {
          var v = readVarintAt(p, inLen, i);
          if (!v.ok) return { changed: false, reason: 'bad-varint' };
          i = v.next;
          continue;
        }
        if (wt === 2) {
          var ln = readVarintAt(p, inLen, i);
          if (!ln.ok) return { changed: false, reason: 'bad-len' };
          i = ln.next;
          var start = i;
          var end = i + ln.value;
          if (end > inLen) return { changed: false, reason: 'len-oob' };
          if (field === 2) {
            if (OVERRIDE_TOKEN.length !== ln.value) {
              return {
                changed: false,
                reason: 'len-mismatch',
                oldLen: ln.value,
                newLen: OVERRIDE_TOKEN.length,
              };
            }
            writeAscii(p, start, OVERRIDE_TOKEN);
            return { changed: true, reason: 'ok', field2Len: ln.value, token: OVERRIDE_TOKEN };
          }
          i = end;
          continue;
        }
        return { changed: false, reason: 'unsupported-wt-' + wt };
      }
      return { changed: false, reason: 'field2-not-found' };
    } catch (e) {
      return { changed: false, reason: 'exception:' + String(e) };
    }
  }

  function install() {
    if (hooksInstalled) return true;
    libnms = Process.findModuleByName('libnms.so');
    if (!libnms) return false;

    var metaAddr = libnms.base.add(OFF_META);
    var fn2811c = libnms.base.add(OFF_2811C);
    var fn2ae64 = libnms.base.add(OFF_2AE64);
    var fn17b6c = libnms.base.add(OFF_17B6C);

    Interceptor.attach(metaAddr, {
      onEnter: function (args) {
        var code = -1;
        try {
          code = args[2].toInt32();
        } catch {
          code = -1;
        }
        if (metaSeen < 40) {
          metaSeen += 1;
          emit({ t: 'meta_seen', code: code });
        }
        if (code !== 301) return;
        var t = tid(this);
        seq += 1;
        active[t] = { seq: seq, startedAt: Date.now() };
        emit({ t: 'meta301_enter', tid: t, seq: seq });
      },
      onLeave: function (retval) {
        var t = tid(this);
        var st = active[t];
        if (!st) return;
        emit({
          t: 'meta301_leave',
          tid: t,
          seq: st.seq,
          durMs: Date.now() - st.startedAt,
          ret: retval ? retval.toString() : null,
        });
        delete active[t];
      },
    });

    Interceptor.attach(fn2811c, {
      onEnter: function (args) {
        var t = tid(this);
        var st = active[t];
        if (!st) return;
        var mode = -1;
        try {
          mode = args[1].toInt32();
        } catch {
          mode = -1;
        }
        this.__ctx = { tid: t, seq: st.seq, mode: mode };
        this.__ctx.outPtrPtr = args[3];
        emit({
          t: 'fn2811c_enter',
          tid: t,
          seq: st.seq,
          mode: mode,
          param3: args[2] ? args[2].toString() : null,
          outPtrPtr: args[3] ? args[3].toString() : null,
        });
      },
      onLeave: function () {
        if (!this.__ctx) return;
        var outObj = null;
        try {
          var p = stripTag(this.__ctx.outPtrPtr) || this.__ctx.outPtrPtr;
          outObj = Memory.readPointer(p).toString();
        } catch {
          outObj = null;
        }
        emit({
          t: 'fn2811c_leave',
          tid: this.__ctx.tid,
          seq: this.__ctx.seq,
          mode: this.__ctx.mode,
          outObj: outObj,
        });
      },
    });

    Interceptor.attach(fn2ae64, {
      onEnter: function (args) {
        var t = tid(this);
        var st = active[t];
        if (!st) return;
        var inLen = 0;
        try {
          inLen = args[1].toInt32() >>> 0;
        } catch {
          inLen = 0;
        }
        this.__ctx = {
          tid: t,
          seq: st.seq,
          inPtr: args[0],
          inLen: inLen,
          outPtrPtr: args[2],
          outLenPtr: args[3],
        };
        var ov = { changed: false, reason: 'skip' };
        if (inLen > 0 && inLen <= 4096) ov = tryOverrideToken(args[0], inLen);
        this.__ctx.override = ov;
        emit({
          t: 'fn2ae64_enter',
          tid: t,
          seq: st.seq,
          inLen: inLen,
          override: ov,
          arg3: args[2] ? args[2].toString() : null,
          arg4: args[3] ? args[3].toString() : null,
        });
      },
      onLeave: function () {
        if (!this.__ctx) return;
        var outPtr = ptr('0x0');
        var outLen = 0;
        var outPtrProbe = {};
        var outLenProbe = {};
        var outReadErr = '';
        try {
          var outPtrPtrCanon = stripTag(this.__ctx.outPtrPtr) || this.__ctx.outPtrPtr;
          var outLenPtrCanon = stripTag(this.__ctx.outLenPtr) || this.__ctx.outLenPtr;
          outPtr = outPtrPtrCanon.readPointer();
          outLen = outLenPtrCanon.readU32() >>> 0;
          if (outLen === 0) {
            // 구현에 따라 64비트 길이를 쓰는 경우 보조 확인
            outLen = Number(outLenPtrCanon.readU64()) >>> 0;
          }
          outPtrProbe = {
            at0: readU64Safe(outPtrPtrCanon),
            at8: readU64Safe(outPtrPtrCanon.add(8)),
            at16: readU64Safe(outPtrPtrCanon.add(16)),
          };
          outLenProbe = {
            at0: readU64Safe(outLenPtrCanon),
            at8: readU64Safe(outLenPtrCanon.add(8)),
            at16: readU64Safe(outLenPtrCanon.add(16)),
          };
        } catch {
          outPtr = ptr('0x0');
          outLen = 0;
          outPtrProbe = {};
          outLenProbe = {};
          try {
            outReadErr = 'outPtrPtr=' + String(this.__ctx.outPtrPtr) + ' outLenPtr=' + String(this.__ctx.outLenPtr);
          } catch {
            outReadErr = 'read-failed';
          }
        }
        var inB64 = '';
        var outB64 = '';
        var inErr = '';
        var outErr = '';
        if (this.__ctx.inLen > 0 && this.__ctx.inLen <= 4096) {
          var inRes = readBytesB64(this.__ctx.inPtr, this.__ctx.inLen);
          inB64 = inRes.b64;
          inErr = inRes.err;
        }
        if (outLen > 0 && outLen <= 4096 && !outPtr.isNull()) {
          var outRes = readBytesB64(outPtr, outLen);
          outB64 = outRes.b64;
          outErr = outRes.err;
        }
        emit({
          t: 'fn2ae64_leave',
          tid: this.__ctx.tid,
          seq: this.__ctx.seq,
          inLen: this.__ctx.inLen,
          outPtr: outPtr.toString(),
          outLen: outLen,
          outPtrProbe: outPtrProbe,
          outLenProbe: outLenProbe,
          outReadErr: outReadErr,
          inErr: inErr,
          outErr: outErr,
          inB64: inB64 ? 'base64:' + inB64 : '',
          outB64: outB64 ? 'base64:' + outB64 : '',
        });
      },
    });

    Interceptor.attach(fn17b6c, {
      onEnter: function (args) {
        var t = tid(this);
        var st = active[t];
        if (!st) return;
        var bufLen = 0;
        try {
          bufLen = args[2].toInt32() >>> 0;
        } catch {
          bufLen = 0;
        }
        var b64 = '';
        var bufPtr = args[1];
        var readErr = '';
        if (bufLen > 0 && bufLen <= 4096) {
          var bufRes = readBytesB64(bufPtr, bufLen);
          b64 = bufRes.b64;
          readErr = bufRes.err;
        }
        var canon = bufPtr ? (stripTag(bufPtr) || bufPtr) : null;
        var range = null;
        try {
          if (canon) {
            var r = Process.findRangeByAddress(canon);
            if (r) {
              range = {
                base: r.base.toString(),
                size: r.size,
                protection: r.protection,
              };
            }
          }
        } catch {
          range = null;
        }
        emit({
          t: 'fn17b6c_enter',
          tid: t,
          seq: st.seq,
          bufPtr: bufPtr ? bufPtr.toString() : null,
          bufPtrCanon: canon ? canon.toString() : null,
          bufLen: bufLen,
          bufRange: range,
          readErr: readErr,
          bufB64: b64 ? 'base64:' + b64 : '',
        });
      },
    });

    hooksInstalled = true;
    emit({
      t: 'hook_ok',
      target: 'meta301+2811c+2ae64+17b6c',
      moduleBase: libnms.base.toString(),
      moduleSize: libnms.size,
      offsets: {
        meta: '0x39894',
        fn2811c: '0x2811c',
        fn2ae64: '0x2ae64',
        fn17b6c: '0x17b6c',
      },
    });
    emit({ t: 'ready', name: 'gs25-pgl-meta-301-pipeline-probe' });
    return true;
  }

  if (!install()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (install() || tries >= 600) {
        clearInterval(timer);
        if (!hooksInstalled) emit({ t: 'init_fail', reason: 'libnms.so not loaded in time' });
      }
    }, 250);
  }
})();
