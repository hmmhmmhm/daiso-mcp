/*
 * GS25 com.pgl.ssdk.ces.a.meta 후킹
 *
 * 목적:
 * - 네이티브 브릿지 meta(int, Context, Object) 호출의 입력/출력 형태를 수집
 */
/* global Java, console */

'use strict';

(function () {
  var LOG_LIMIT = 2000;
  var BASE64_PREVIEW_LIMIT = 8192;
  var logCount = 0;
  var WATCH_CODES = {
    224: true,
    226: true,
    227: true,
    301: true,
    302: true,
    303: true,
  };
  var Base64 = null;
  var ArrayReflect = null;
  var Thread = null;

  function emit(e) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    if (e && typeof e === 'object' && e.ts === undefined) {
      e.ts = Date.now();
    }
    console.log('[GS25_PGL_META] ' + JSON.stringify(e));
  }

  function safeClassName(obj) {
    try {
      if (obj === null || obj === undefined) return 'null';
      return obj.getClass().getName().toString();
    } catch {
      try {
        return obj.$className || 'unknown';
      } catch {
        return 'unknown';
      }
    }
  }

  function safeToString(obj) {
    try {
      if (obj === null || obj === undefined) return 'null';
      var s = obj.toString();
      if (!s) return '';
      s = String(s);
      if (s.length > 300) return s.slice(0, 300) + '...(truncated)';
      return s;
    } catch {
      return '<toString-error>';
    }
  }

  function trimText(s, limit) {
    if (!s) return '';
    var t = String(s);
    if (t.length > limit) return t.slice(0, limit) + '...(truncated)';
    return t;
  }

  function byteArrayToBase64(bytesObj) {
    try {
      if (!Base64) return '';
      return String(Base64.encodeToString(bytesObj, 2)); // NO_WRAP
    } catch {
      return '';
    }
  }

  function toUnsignedByte(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return 0;
    if (v < 0) return (v + 256) & 0xff;
    return v & 0xff;
  }

  function manualBase64FromByteArray(bytesObj) {
    try {
      if (!ArrayReflect) return '';
      var len = ArrayReflect.getLength(bytesObj);
      if (len <= 0) return '';
      var table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      var out = '';
      var i = 0;
      while (i < len) {
        var b0 = toUnsignedByte(ArrayReflect.get(bytesObj, i));
        var hasB1 = i + 1 < len;
        var hasB2 = i + 2 < len;
        var b1 = hasB1 ? toUnsignedByte(ArrayReflect.get(bytesObj, i + 1)) : 0;
        var b2 = hasB2 ? toUnsignedByte(ArrayReflect.get(bytesObj, i + 2)) : 0;
        var n = (b0 << 16) | (b1 << 8) | b2;
        out += table[(n >> 18) & 0x3f];
        out += table[(n >> 12) & 0x3f];
        out += hasB1 ? table[(n >> 6) & 0x3f] : '=';
        out += hasB2 ? table[n & 0x3f] : '=';
        i += 3;
      }
      return out;
    } catch {
      return '';
    }
  }

  function reflectArrayPreview(arrObj) {
    try {
      if (!ArrayReflect || arrObj === null || arrObj === undefined) return '';
      var len = ArrayReflect.getLength(arrObj);
      var out = [];
      var max = len > 24 ? 24 : len;
      for (var i = 0; i < max; i += 1) {
        var item = ArrayReflect.get(arrObj, i);
        out.push(safeToString(item));
      }
      if (len > max) out.push('...+' + (len - max) + ' more');
      return '[' + out.join(', ') + ']';
    } catch {
      return '';
    }
  }

  function deepPreview(obj) {
    try {
      if (obj === null || obj === undefined) return 'null';
      var cls = safeClassName(obj);
      if (cls === 'java.lang.String') return trimText(String(obj), 800);
      if (cls === '[B') {
        var b64 = byteArrayToBase64(obj);
        if (!b64) b64 = manualBase64FromByteArray(obj);
        // base64 payload는 protobuf/암호화 판별에 필요하므로 길게 보존
        if (b64) return trimText('base64:' + b64, BASE64_PREVIEW_LIMIT);
        var arrTxt = reflectArrayPreview(obj);
        if (arrTxt) return trimText(arrTxt, 800);
        return trimText(safeToString(obj), 800);
      }
      if (cls === '[Ljava.lang.Object;') {
        var objArrTxt = reflectArrayPreview(obj);
        if (objArrTxt) return trimText(objArrTxt, 800);
        return trimText(safeToString(obj), 800);
      }
      return trimText(safeToString(obj), 800);
    } catch {
      return '<deepPreview-error>';
    }
  }

  function captureStack() {
    try {
      if (!Thread) return [];
      var arr = Thread.currentThread().getStackTrace();
      var out = [];
      for (var i = 0; i < arr.length; i += 1) {
        var line = String(arr[i]);
        out.push(line);
        if (out.length >= 12) break;
      }
      return out;
    } catch {
      return [];
    }
  }

  Java.perform(function () {
    var Cls;
    try {
      Cls = Java.use('com.pgl.ssdk.ces.a');
    } catch {
      emit({ t: 'hook_fail', target: 'com.pgl.ssdk.ces.a' });
      return;
    }
    try {
      Base64 = Java.use('android.util.Base64');
    } catch {
      Base64 = null;
    }
    try {
      ArrayReflect = Java.use('java.lang.reflect.Array');
    } catch {
      ArrayReflect = null;
    }
    try {
      Thread = Java.use('java.lang.Thread');
    } catch {
      Thread = null;
    }

    var ov = Cls.meta.overload('int', 'android.content.Context', 'java.lang.Object');
    ov.implementation = function (code, ctx, obj) {
      var ctxName = safeClassName(ctx);
      var objName = safeClassName(obj);
      var objPreview = safeToString(obj);
      var objDeep = deepPreview(obj);
      var stack = WATCH_CODES[code] ? captureStack() : [];
      emit({
        t: 'meta_call',
        code: code,
        contextClass: ctxName,
        objClass: objName,
        objPreview: objPreview,
        objDeep: objDeep,
        stack: stack,
      });
      var ret = ov.call(this, code, ctx, obj);
      var retDeep = deepPreview(ret);
      emit({
        t: 'meta_return',
        code: code,
        retClass: safeClassName(ret),
        retPreview: safeToString(ret),
        retDeep: retDeep,
      });
      return ret;
    };

    emit({ t: 'hook_ok', target: 'com.pgl.ssdk.ces.a.meta' });
    emit({ t: 'ready', name: 'gs25-pgl-meta-hook' });
  });
})();
