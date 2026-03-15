/*
 * GS25 msg-api d 파라미터 추적 스크립트
 *
 * 목적:
 * - msg-api 요청 직전 전송 바디를 직접 관찰
 * - OutputStream write 시점에서 d= 페이로드를 캡처
 */

Java.perform(function () {
  var LOG_LIMIT = 3000;
  var MAX_PREVIEW = 500;
  var logCount = 0;
  var streamToUrl = {};

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

  function bytesToUtf8(bytes) {
    try {
      var JString = Java.use('java.lang.String');
      return JString.$new(bytes, 'UTF-8').toString();
    } catch (e) {
      return '';
    }
  }

  function preview(s) {
    if (!s) return '';
    var one = s.replace(/\s+/g, ' ').trim();
    return one.length <= MAX_PREVIEW ? one : one.slice(0, MAX_PREVIEW) + '...';
  }

  function isMsgApiUrl(url) {
    if (!url) return false;
    var l = url.toLowerCase();
    return l.indexOf('tms31.gsshop.com/msg-api/') >= 0;
  }

  function keyForObj(obj) {
    try {
      return obj.hashCode().toString();
    } catch (e) {
      return null;
    }
  }

  try {
    var URLConnection = Java.use('java.net.URLConnection');
    var getOutputStream = URLConnection.getOutputStream.overload();
    getOutputStream.implementation = function () {
      var out = getOutputStream.call(this);
      try {
        var url = safeToString(this.getURL());
        if (isMsgApiUrl(url)) {
          var key = keyForObj(out);
          if (key) {
            streamToUrl[key] = url;
            log('[MSGAPI_STREAM] bind stream=' + key + ' url=' + url);
          }
        }
      } catch (e) {}
      return out;
    };
    log('[+] URLConnection.getOutputStream hook active');
  } catch (e) {
    log('[-] URLConnection hook failed: ' + e);
  }

  try {
    var OutputStream = Java.use('java.io.OutputStream');

    var writeBytes = OutputStream.write.overload('[B');
    writeBytes.implementation = function (b) {
      try {
        var key = keyForObj(this);
        var url = key ? streamToUrl[key] : null;
        if (url) {
          var body = bytesToUtf8(b);
          if (body && body.indexOf('d=') >= 0) {
            log('[MSGAPI_BODY] url=' + url + ' body=' + preview(body));
          }
        }
      } catch (e) {}
      return writeBytes.call(this, b);
    };

    var writeSlice = OutputStream.write.overload('[B', 'int', 'int');
    writeSlice.implementation = function (b, off, len) {
      try {
        var key = keyForObj(this);
        var url = key ? streamToUrl[key] : null;
        if (url) {
          var all = bytesToUtf8(b);
          if (all && all.length > off) {
            var body = all.slice(off, off + len);
            if (body.indexOf('d=') >= 0) {
              log('[MSGAPI_BODY_SLICE] url=' + url + ' body=' + preview(body));
            }
          }
        }
      } catch (e) {}
      return writeSlice.call(this, b, off, len);
    };

    log('[+] OutputStream.write hook active');
  } catch (e) {
    log('[-] OutputStream hook failed: ' + e);
  }

  try {
    var StringCls = Java.use('java.lang.String');
    var initBytes = StringCls.$init.overload('[B', 'java.lang.String');
    initBytes.implementation = function (arr, charset) {
      var ret = initBytes.call(this, arr, charset);
      try {
        var text = ret.toString();
        if (text && text.indexOf('d=') >= 0) {
          log('[STRING_FROM_BYTES] ' + preview(text));
        }
      } catch (e) {}
      return ret;
    };
    log('[+] String(byte[], charset) hook active');
  } catch (e) {
    log('[-] String hook failed: ' + e);
  }

  log('[+] gs25-msgapi-dparam-hook ready');
});
