/*
 * GS25 msg-api okio 전송 경로 추적 스크립트
 *
 * 목적:
 * - java.io.OutputStream 경로에서 놓친 전송 바디를 okio 계층에서 관찰
 * - d= 파라미터 또는 msg-api 관련 페이로드 후보를 로깅
 */

Java.perform(function () {
  var LOG_LIMIT = 4000;
  var MAX_PREVIEW = 500;
  var logCount = 0;

  function log(msg) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    console.log(msg);
  }

  function preview(s) {
    if (!s) return '';
    var one = s.replace(/\s+/g, ' ').trim();
    return one.length <= MAX_PREVIEW ? one : one.slice(0, MAX_PREVIEW) + '...';
  }

  function looksInteresting(s) {
    if (!s) return false;
    var l = s.toLowerCase();
    return (
      l.indexOf('d=') >= 0 ||
      l.indexOf('msg-api') >= 0 ||
      l.indexOf('devicecert') >= 0 ||
      l.indexOf('setconfig') >= 0 ||
      l.indexOf('login') >= 0
    );
  }

  function tryHook(className, methodName, onOverload) {
    try {
      var C = Java.use(className);
      if (!C[methodName] || !C[methodName].overloads) return false;
      var ovs = C[methodName].overloads;
      for (var i = 0; i < ovs.length; i++) onOverload(ovs[i], i);
      log('[+] hook ' + className + '.' + methodName + ' (' + ovs.length + ')');
      return true;
    } catch (e) {
      return false;
    }
  }

  // okio.Buffer.writeUtf8(String)
  tryHook('okio.Buffer', 'writeUtf8', function (ov, idx) {
    if (ov.argumentTypes.length !== 1) return;
    if (ov.argumentTypes[0].className !== 'java.lang.String') return;
    ov.implementation = function (s) {
      var text = s ? s.toString() : '';
      if (looksInteresting(text)) {
        log('[OKIO.writeUtf8] ' + preview(text));
      }
      return ov.call(this, s);
    };
  });

  // okio.Buffer.write(byte[])
  tryHook('okio.Buffer', 'write', function (ov, idx) {
    if (ov.argumentTypes.length === 1 && ov.argumentTypes[0].className === '[B') {
      ov.implementation = function (b) {
        try {
          var JString = Java.use('java.lang.String');
          var text = JString.$new(b, 'UTF-8').toString();
          if (looksInteresting(text)) {
            log('[OKIO.writeBytes] ' + preview(text));
          }
        } catch (e) {}
        return ov.call(this, b);
      };
    }
  });

  // okio.RealBufferedSink.writeUtf8(String)
  tryHook('okio.RealBufferedSink', 'writeUtf8', function (ov, idx) {
    if (ov.argumentTypes.length !== 1) return;
    if (ov.argumentTypes[0].className !== 'java.lang.String') return;
    ov.implementation = function (s) {
      var text = s ? s.toString() : '';
      if (looksInteresting(text)) {
        log('[RBS.writeUtf8] ' + preview(text));
      }
      return ov.call(this, s);
    };
  });

  // okio.RealBufferedSink.write(byte[])
  tryHook('okio.RealBufferedSink', 'write', function (ov, idx) {
    if (ov.argumentTypes.length === 1 && ov.argumentTypes[0].className === '[B') {
      ov.implementation = function (b) {
        try {
          var JString = Java.use('java.lang.String');
          var text = JString.$new(b, 'UTF-8').toString();
          if (looksInteresting(text)) {
            log('[RBS.writeBytes] ' + preview(text));
          }
        } catch (e) {}
        return ov.call(this, b);
      };
    }
  });

  // okio.ByteString.utf8()
  tryHook('okio.ByteString', 'utf8', function (ov, idx) {
    if (ov.argumentTypes.length !== 0) return;
    ov.implementation = function () {
      var out = ov.call(this);
      var text = out ? out.toString() : '';
      if (looksInteresting(text)) {
        log('[ByteString.utf8] ' + preview(text));
      }
      return out;
    };
  });

  log('[+] gs25-msgapi-okio-hook ready');
});
