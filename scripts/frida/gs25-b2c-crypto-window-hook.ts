/*
 * GS25 b2c 암복호화 윈도우 추적 스크립트
 *
 * 목적:
 * - b2c/woodongs URL이 생성되는 시점을 기준으로 짧은 시간창에서
 *   query 파라미터 + Base64 + Cipher 이벤트를 집중 수집
 * - request_e/response_e 및 재고조회 핵심 파라미터를 구조화 로그로 남김
 */
/* global Java, console */

Java.perform(function () {
  var LOG_LIMIT = 6000;
  var WINDOW_MS = 8000;
  var MAX_PREVIEW = 420;
  var logCount = 0;
  var lastWindowTs = 0;

  var keyHints = [
    'request_e',
    'response_e',
    'keyword',
    'itemcode',
    'item_cd',
    'item_dcls_cd',
    'storecode',
    'servicecode',
    'realtimestockyn',
    'latitude',
    'longitude',
    'xcoordination',
    'ycoordination',
  ];

  function now() {
    return Date.now();
  }

  function safe(v) {
    try {
      if (v === null || v === undefined) {
        return 'null';
      }
      return v.toString();
    } catch (e) {
      return '<err:' + e + '>';
    }
  }

  function lower(v) {
    return safe(v).toLowerCase();
  }

  function preview(v) {
    var s = safe(v).replace(/\s+/g, ' ').trim();
    if (s.length <= MAX_PREVIEW) {
      return s;
    }
    return s.slice(0, MAX_PREVIEW) + '...';
  }

  function bytesToUtf8(arr) {
    try {
      var JString = Java.use('java.lang.String');
      return JString.$new(arr, 'UTF-8').toString();
    } catch {
      return '';
    }
  }

  function shouldLogMore() {
    return logCount < LOG_LIMIT;
  }

  function emit(event) {
    if (!shouldLogMore()) {
      return;
    }
    logCount += 1;
    console.log('[GS25_B2C_CRYPTO] ' + JSON.stringify(event));
  }

  function markWindow(reason) {
    lastWindowTs = now();
    emit({ t: 'window_mark', ts: lastWindowTs, reason: preview(reason) });
  }

  function inWindow() {
    if (lastWindowTs === 0) {
      return false;
    }
    return now() - lastWindowTs <= WINDOW_MS;
  }

  function hasInterestingHostOrPath(v) {
    var l = lower(v);
    return (
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c-') >= 0 ||
      l.indexOf('/api/bff/') >= 0 ||
      l.indexOf('/search/v3/') >= 0 ||
      l.indexOf('/api/addition/autocomplete/offline') >= 0 ||
      l.indexOf('request_e=') >= 0 ||
      l.indexOf('response_e=') >= 0
    );
  }

  function isInterestingKey(k) {
    var lk = lower(k);
    for (var i = 0; i < keyHints.length; i += 1) {
      if (lk.indexOf(keyHints[i]) >= 0) {
        return true;
      }
    }
    return false;
  }

  function maybeDecodeBase64(s) {
    try {
      var Base64 = Java.use('android.util.Base64');
      var out = Base64.decode(s, 0);
      return preview(bytesToUtf8(out));
    } catch {
      return '';
    }
  }

  function captureStackHint() {
    try {
      var Thread = Java.use('java.lang.Thread');
      var frames = Thread.currentThread().getStackTrace();
      var out = [];
      for (var i = 0; i < frames.length && i < 18; i += 1) {
        var line = frames[i].toString();
        var l = line.toLowerCase();
        if (
          l.indexOf('com.gsr') >= 0 ||
          l.indexOf('woodongs') >= 0 ||
          l.indexOf('b2c') >= 0 ||
          l.indexOf('okhttp') >= 0 ||
          l.indexOf('cronet') >= 0
        ) {
          out.push(line);
        }
      }
      return out.join(' | ');
    } catch {
      return '';
    }
  }

  function hook(className, methodName, installFn) {
    try {
      var C = Java.use(className);
      if (!C[methodName] || !C[methodName].overloads) {
        return;
      }
      var ovs = C[methodName].overloads;
      for (var i = 0; i < ovs.length; i += 1) {
        installFn(ovs[i], i);
      }
      emit({ t: 'hook_ok', className: className, methodName: methodName, count: ovs.length });
    } catch (e) {
      emit({ t: 'hook_fail', className: className, methodName: methodName, err: safe(e) });
    }
  }

  // URL 생성 지점
  hook('java.net.URL', '$init', function (ov) {
    if (ov.argumentTypes.length !== 1 || ov.argumentTypes[0].className !== 'java.lang.String') {
      return;
    }
    ov.implementation = function (spec) {
      var s = safe(spec);
      if (hasInterestingHostOrPath(s)) {
        markWindow(s);
        emit({ t: 'url_ctor', ts: now(), url: preview(s) });
      }
      return ov.call(this, spec);
    };
  });

  hook('android.net.Uri', 'parse', function (ov) {
    if (ov.argumentTypes.length !== 1 || ov.argumentTypes[0].className !== 'java.lang.String') {
      return;
    }
    ov.implementation = function (spec) {
      var s = safe(spec);
      if (hasInterestingHostOrPath(s)) {
        markWindow(s);
        emit({ t: 'uri_parse', ts: now(), url: preview(s) });
      }
      return ov.call(this, spec);
    };
  });

  // OkHttp URL/Query
  hook('okhttp3.Request$Builder', 'url', function (ov) {
    ov.implementation = function () {
      var arg0 = arguments.length > 0 ? safe(arguments[0]) : '';
      if (hasInterestingHostOrPath(arg0)) {
        markWindow(arg0);
        emit({ t: 'okhttp_url', ts: now(), url: preview(arg0) });
      }
      return ov.apply(this, arguments);
    };
  });

  hook('okhttp3.HttpUrl$Builder', 'addQueryParameter', function (ov) {
    if (ov.argumentTypes.length !== 2) {
      return;
    }
    ov.implementation = function (k, v) {
      if (isInterestingKey(k)) {
        var valuePreview = preview(v);
        var decoded = '';
        var lk = lower(k);
        if (lk.indexOf('request_e') >= 0 || lk.indexOf('response_e') >= 0) {
          decoded = maybeDecodeBase64(safe(v));
        }
        emit({
          t: 'query_add',
          ts: now(),
          key: safe(k),
          value: valuePreview,
          decodedPreview: decoded,
          stackHint: preview(captureStackHint()),
        });
      }
      return ov.call(this, k, v);
    };
  });

  hook('okhttp3.HttpUrl$Builder', 'setQueryParameter', function (ov) {
    if (ov.argumentTypes.length !== 2) {
      return;
    }
    ov.implementation = function (k, v) {
      if (isInterestingKey(k)) {
        emit({
          t: 'query_set',
          ts: now(),
          key: safe(k),
          value: preview(v),
          stackHint: preview(captureStackHint()),
        });
      }
      return ov.call(this, k, v);
    };
  });

  // Cronet URL
  hook('org.chromium.net.UrlRequest$Builder', '$init', function (ov) {
    if (ov.argumentTypes.length < 1) {
      return;
    }
    if (ov.argumentTypes[0].className !== 'java.lang.String') {
      return;
    }
    ov.implementation = function () {
      var url = safe(arguments[0]);
      if (hasInterestingHostOrPath(url)) {
        markWindow(url);
        emit({ t: 'cronet_url', ts: now(), url: preview(url) });
      }
      return ov.apply(this, arguments);
    };
  });

  hook('org.chromium.net.UrlRequest$Builder', 'setHttpMethod', function (ov) {
    if (ov.argumentTypes.length !== 1 || ov.argumentTypes[0].className !== 'java.lang.String') {
      return;
    }
    ov.implementation = function (method) {
      if (inWindow()) {
        emit({ t: 'cronet_method', ts: now(), method: safe(method) });
      }
      return ov.call(this, method);
    };
  });

  hook('org.chromium.net.UrlRequest$Builder', 'addHeader', function (ov) {
    if (ov.argumentTypes.length !== 2) {
      return;
    }
    ov.implementation = function (k, v) {
      if (isInterestingKey(k)) {
        emit({
          t: 'cronet_header',
          ts: now(),
          key: safe(k),
          value: preview(v),
        });
      }
      return ov.call(this, k, v);
    };
  });

  // Uri Builder query
  hook('android.net.Uri$Builder', 'appendQueryParameter', function (ov) {
    if (ov.argumentTypes.length !== 2) {
      return;
    }
    ov.implementation = function (k, v) {
      if (isInterestingKey(k)) {
        emit({
          t: 'uri_query_append',
          ts: now(),
          key: safe(k),
          value: preview(v),
        });
      }
      return ov.call(this, k, v);
    };
  });

  // Base64
  hook('android.util.Base64', 'decode', function (ov) {
    if (ov.argumentTypes.length !== 2 || ov.argumentTypes[0].className !== 'java.lang.String') {
      return;
    }
    ov.implementation = function (src, flags) {
      var out = ov.call(this, src, flags);
      if (inWindow()) {
        var st = captureStackHint();
        if (st) {
          emit({
            t: 'base64_decode',
            ts: now(),
            inPreview: preview(src),
            outPreview: preview(bytesToUtf8(out)),
            stackHint: preview(st),
          });
        }
      }
      return out;
    };
  });

  hook('android.util.Base64', 'encodeToString', function (ov) {
    if (ov.argumentTypes.length !== 2 || ov.argumentTypes[0].className !== '[B') {
      return;
    }
    ov.implementation = function (input, flags) {
      var ret = ov.call(this, input, flags);
      if (inWindow()) {
        var st = captureStackHint();
        if (st) {
          emit({
            t: 'base64_encode',
            ts: now(),
            inPreview: preview(bytesToUtf8(input)),
            outPreview: preview(ret),
            stackHint: preview(st),
          });
        }
      }
      return ret;
    };
  });

  // Cipher
  try {
    var Cipher = Java.use('javax.crypto.Cipher');
    var modeMap = {};

    var cipherInit = Cipher.init.overload('int', 'java.security.Key');
    cipherInit.implementation = function (mode, key) {
      modeMap[this.hashCode()] = mode;
      return cipherInit.call(this, mode, key);
    };

    var doFinal1 = Cipher.doFinal.overload('[B');
    doFinal1.implementation = function (input) {
      var out = doFinal1.call(this, input);
      if (inWindow()) {
        var st = captureStackHint();
        if (st) {
          emit({
            t: 'cipher_dofinal',
            ts: now(),
            algo: safe(this.getAlgorithm()),
            mode: modeMap[this.hashCode()] || null,
            inPreview: preview(bytesToUtf8(input)),
            outPreview: preview(bytesToUtf8(out)),
            stackHint: preview(st),
          });
        }
      }
      return out;
    };
    emit({ t: 'hook_ok', className: 'javax.crypto.Cipher', methodName: 'doFinal([B)', count: 1 });
  } catch (e) {
    emit({ t: 'hook_fail', className: 'javax.crypto.Cipher', methodName: 'doFinal([B)', err: safe(e) });
  }

  // Response body
  hook('okhttp3.ResponseBody', 'string', function (ov) {
    if (ov.argumentTypes.length !== 0) {
      return;
    }
    ov.implementation = function () {
      var ret = ov.call(this);
      var text = safe(ret);
      if (inWindow() || hasInterestingHostOrPath(text)) {
        emit({
          t: 'response_body_string',
          ts: now(),
          preview: preview(text),
        });
      }
      return ret;
    };
  });

  emit({
    t: 'ready',
    ts: now(),
    name: 'gs25-b2c-crypto-window-hook',
    windowMs: WINDOW_MS,
    warmupWindowActive: false,
  });
});
