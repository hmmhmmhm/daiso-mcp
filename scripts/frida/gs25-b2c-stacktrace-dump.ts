/*
 * GS25 b2c 콜스택 기반 덤프 스크립트
 *
 * 목적:
 * - 최종 문자열/JSON 생성 지점을 스택과 함께 포착
 * - 암복호 직후 평문이 String/JSONObject로 만들어지는 순간을 식별
 */

Java.perform(function () {
  var LOG_LIMIT = 5000;
  var logCount = 0;
  var MAX_PREVIEW = 600;

  function log(msg) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    console.log(msg);
  }

  function safeToString(v) {
    try {
      if (v === null || v === undefined) return 'null';
      return v.toString();
    } catch (e) {
      return '<toString-error:' + e + '>';
    }
  }

  function preview(s) {
    if (!s) return '';
    var one = ('' + s).replace(/\s+/g, ' ').trim();
    if (one.length <= MAX_PREVIEW) return one;
    return one.slice(0, MAX_PREVIEW) + '...';
  }

  function looksInterestingText(s) {
    if (!s) return false;
    var l = ('' + s).toLowerCase();
    return (
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c-') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('msg-api') >= 0 ||
      l.indexOf('inventory') >= 0 ||
      l.indexOf('stock') >= 0 ||
      l.indexOf('goods') >= 0 ||
      l.indexOf('store') >= 0 ||
      l.indexOf('qty') >= 0 ||
      l.indexOf('{') >= 0 ||
      l.indexOf('[') >= 0
    );
  }

  function getStack() {
    try {
      var Exception = Java.use('java.lang.Exception');
      var e = Exception.$new();
      var arr = e.getStackTrace();
      var out = [];
      var n = arr.length < 20 ? arr.length : 20;
      for (var i = 0; i < n; i++) {
        out.push(arr[i].toString());
      }
      return out;
    } catch (err) {
      return ['<stack-error:' + err + '>'];
    }
  }

  function stackInteresting(lines) {
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i];
      if (
        s.indexOf('S5.') >= 0 ||
        s.indexOf('E5.') >= 0 ||
        s.indexOf('K5.') >= 0 ||
        s.indexOf('L5.') >= 0 ||
        s.indexOf('F5.') >= 0 ||
        s.indexOf('G5.') >= 0 ||
        s.indexOf('com.gsr.gs25') >= 0
      ) {
        return true;
      }
    }
    return false;
  }

  function logEvent(tag, text, stack) {
    log('\n[' + tag + '] ' + preview(text) + '\n' + stack.join('\n'));
  }

  // String(byte[], String charset) 생성 지점
  try {
    var JString = Java.use('java.lang.String');
    var ctor1 = JString.$init.overload('[B', 'java.lang.String');
    ctor1.implementation = function (bytes, charset) {
      var ret = ctor1.call(this, bytes, charset);
      try {
        var s = this.toString();
        var stack = getStack();
        if (looksInterestingText(s) && stackInteresting(stack)) {
          logEvent('String.<init>(bytes,charset)', s, stack);
        }
      } catch (e) {}
      return ret;
    };

    var ctor2 = JString.$init.overload('[B', 'java.nio.charset.Charset');
    ctor2.implementation = function (bytes, cs) {
      var ret = ctor2.call(this, bytes, cs);
      try {
        var s2 = this.toString();
        var stack2 = getStack();
        if (looksInterestingText(s2) && stackInteresting(stack2)) {
          logEvent('String.<init>(bytes,Charset)', s2, stack2);
        }
      } catch (e2) {}
      return ret;
    };
    log('[+] String(byte[]) ctor hooks active');
  } catch (e) {
    log('[-] String ctor hook failed: ' + e);
  }

  // JSONObject(String) 생성 지점
  try {
    var JSONObject = Java.use('org.json.JSONObject');
    var joCtor = JSONObject.$init.overload('java.lang.String');
    joCtor.implementation = function (jsonStr) {
      var s = safeToString(jsonStr);
      var stack = getStack();
      if (looksInterestingText(s) && stackInteresting(stack)) {
        logEvent('JSONObject.<init>(String)', s, stack);
      }
      return joCtor.call(this, jsonStr);
    };
    log('[+] JSONObject(String) hook active');
  } catch (e) {
    log('[-] JSONObject hook failed: ' + e);
  }

  // Cipher.doFinal 결과 바이트를 UTF-8 후보로 관찰
  try {
    var Cipher = Java.use('javax.crypto.Cipher');
    var doFinal1 = Cipher.doFinal.overload('[B');
    doFinal1.implementation = function (input) {
      var out = doFinal1.call(this, input);
      try {
        var JString2 = Java.use('java.lang.String');
        var maybe = JString2.$new(out, 'UTF-8').toString();
        var stack = getStack();
        if (looksInterestingText(maybe) && stackInteresting(stack)) {
          logEvent('Cipher.doFinal([B)', maybe, stack);
        }
      } catch (e) {}
      return out;
    };
    log('[+] Cipher.doFinal([B) hook active');
  } catch (e) {
    log('[-] Cipher hook failed: ' + e);
  }

  // URL 생성 지점
  try {
    var URL = Java.use('java.net.URL');
    var urlCtor = URL.$init.overload('java.lang.String');
    urlCtor.implementation = function (spec) {
      var ret = urlCtor.call(this, spec);
      var s = safeToString(spec);
      var stack = getStack();
      if (looksInterestingText(s) && stackInteresting(stack)) {
        logEvent('URL.<init>(String)', s, stack);
      }
      return ret;
    };
    log('[+] URL(String) hook active');
  } catch (e) {
    log('[-] URL hook failed: ' + e);
  }

  log('[+] gs25-b2c-stacktrace-dump ready');
});
