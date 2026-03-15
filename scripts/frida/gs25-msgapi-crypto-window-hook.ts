/*
 * GS25 msg-api 암복호 윈도우 추적 스크립트
 *
 * 목적:
 * - msg-api URL 생성/접속 직후 짧은 시간창(기본 5초)에서만
 *   Base64/Cipher/String 변환 이벤트를 수집
 * - 노이즈를 줄이고 d= 생성/해석 후보를 집중 관찰
 */

Java.perform(function () {
  var LOG_LIMIT = 4000;
  var MAX_PREVIEW = 500;
  var WINDOW_MS = 5000;
  var logCount = 0;
  var lastMsgApiTs = 0;

  function now() {
    return Date.now();
  }

  function mark(reason) {
    lastMsgApiTs = now();
    log('[WINDOW_MARK] ' + reason + ' ts=' + lastMsgApiTs);
  }

  function inWindow() {
    if (lastMsgApiTs === 0) return false;
    return now() - lastMsgApiTs <= WINDOW_MS;
  }

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
    var one = s.replace(/\s+/g, ' ').trim();
    return one.length <= MAX_PREVIEW ? one : one.slice(0, MAX_PREVIEW) + '...';
  }

  function bytesToUtf8(bytes) {
    try {
      var JString = Java.use('java.lang.String');
      return JString.$new(bytes, 'UTF-8').toString();
    } catch (e) {
      return '';
    }
  }

  function looksInteresting(s) {
    if (!s) return false;
    var l = s.toLowerCase();
    return (
      l.indexOf('d=') >= 0 ||
      l.indexOf('msg-api') >= 0 ||
      l.indexOf('devicecert') >= 0 ||
      l.indexOf('setconfig') >= 0 ||
      l.indexOf('login') >= 0 ||
      l.indexOf('{') >= 0 ||
      l.indexOf('}') >= 0
    );
  }

  function getStackText() {
    try {
      var Thread = Java.use('java.lang.Thread');
      var frames = Thread.currentThread().getStackTrace();
      var out = [];
      for (var i = 0; i < frames.length; i++) out.push(frames[i].toString());
      return out.join('\n');
    } catch (e) {
      return '';
    }
  }

  function stackFromApp(stack) {
    if (!stack) return false;
    return (
      stack.indexOf('com.gsr') >= 0 ||
      stack.indexOf('woodongs') >= 0 ||
      stack.indexOf('gsshop') >= 0 ||
      stack.indexOf('msg-api') >= 0
    );
  }

  function logEvent(title, body) {
    log('\n=== ' + title + ' ===\n' + body + '\n=== /' + title + ' ===');
  }

  // msg-api URL 생성 시점으로 윈도우 시작
  try {
    var URL = Java.use('java.net.URL');
    var URLCtor = URL.$init.overload('java.lang.String');
    URLCtor.implementation = function (spec) {
      var ret = URLCtor.call(this, spec);
      var s = safeToString(spec);
      if (s.indexOf('tms31.gsshop.com/msg-api/') >= 0) {
        mark('URL ' + s);
      }
      return ret;
    };
    log('[+] URL window marker hook active');
  } catch (e) {
    log('[-] URL marker hook failed: ' + e);
  }

  // Base64
  try {
    var Base64 = Java.use('android.util.Base64');
    var b64Decode = Base64.decode.overload('java.lang.String', 'int');
    b64Decode.implementation = function (src, flags) {
      var out = b64Decode.call(this, src, flags);
      if (!inWindow()) return out;

      var stack = getStackText();
      if (!stackFromApp(stack)) return out;

      var inText = safeToString(src);
      var outText = bytesToUtf8(out);
      if (looksInteresting(inText) || looksInteresting(outText)) {
        logEvent(
          'WIN_BASE64_DECODE',
          'in=' + preview(inText) + '\nout=' + preview(outText) + '\nstack=' + preview(stack),
        );
      }
      return out;
    };

    var b64Encode = Base64.encodeToString.overload('[B', 'int');
    b64Encode.implementation = function (input, flags) {
      var ret = b64Encode.call(this, input, flags);
      if (!inWindow()) return ret;

      var stack = getStackText();
      if (!stackFromApp(stack)) return ret;

      var inText = bytesToUtf8(input);
      if (looksInteresting(inText) || looksInteresting(ret)) {
        logEvent(
          'WIN_BASE64_ENCODE',
          'in=' + preview(inText) + '\nout=' + preview(ret) + '\nstack=' + preview(stack),
        );
      }
      return ret;
    };
    log('[+] Base64 window hook active');
  } catch (e) {
    log('[-] Base64 hook failed: ' + e);
  }

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
      if (!inWindow()) return out;

      var stack = getStackText();
      if (!stackFromApp(stack)) return out;

      var inText = bytesToUtf8(input);
      var outText = bytesToUtf8(out);
      if (looksInteresting(inText) || looksInteresting(outText)) {
        var mode = modeMap[this.hashCode()];
        var algo = safeToString(this.getAlgorithm());
        logEvent(
          'WIN_CIPHER_DOFINAL',
          'algo=' +
            algo +
            ' mode=' +
            mode +
            '\nin=' +
            preview(inText) +
            '\nout=' +
            preview(outText) +
            '\nstack=' +
            preview(stack),
        );
      }
      return out;
    };
    log('[+] Cipher window hook active');
  } catch (e) {
    log('[-] Cipher hook failed: ' + e);
  }

  // String(byte[]) 변환
  try {
    var JString = Java.use('java.lang.String');
    var initBytesUtf8 = JString.$init.overload('[B', 'java.lang.String');
    initBytesUtf8.implementation = function (arr, charset) {
      var ret = initBytesUtf8.call(this, arr, charset);
      if (!inWindow()) return ret;

      var text = ret ? ret.toString() : '';
      if (looksInteresting(text)) {
        var stack = getStackText();
        if (stackFromApp(stack)) {
          logEvent('WIN_STRING_BYTES', 'text=' + preview(text) + '\nstack=' + preview(stack));
        }
      }
      return ret;
    };
    log('[+] String window hook active');
  } catch (e) {
    log('[-] String hook failed: ' + e);
  }

  log('[+] gs25-msgapi-crypto-window-hook ready');
});
