/*
 * GS25 b2c 부트스트랩 프로브
 *
 * 목적:
 * - `appKey`, `xTenantId`, `Authorization`, `deviceId`가
 *   Java/Flutter 경계에서 언제 준비되는지 관찰
 * - Dart 내부 메서드를 직접 후킹하지 못하는 한계를 보완하기 위해
 *   MethodChannel, SharedPreferences, Cronet/OkHttp 헤더 경계만 선별 기록
 *
 * 주의:
 * - anti-Frida 환경을 고려해 무거운 클래스 전수 스캔은 하지 않음
 * - 민감값은 전체를 그대로 출력하지 않고 짧게 마스킹
 */

Java.perform(function () {
  var LOG_LIMIT = 3000;
  var logCount = 0;
  var MAX_PREVIEW = 220;

  function log(msg) {
    if (logCount >= LOG_LIMIT) {
      return;
    }
    logCount += 1;
    console.log(msg);
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

  function preview(v) {
    var s = safe(v).replace(/\s+/g, ' ').trim();
    if (s.length <= MAX_PREVIEW) {
      return s;
    }
    return s.slice(0, MAX_PREVIEW) + '...';
  }

  function mask(v) {
    var s = safe(v);
    if (s === 'null') {
      return s;
    }
    if (s.length <= 12) {
      return s;
    }
    return s.slice(0, 6) + '...' + s.slice(-4);
  }

  function lower(v) {
    return safe(v).toLowerCase();
  }

  function interestingKey(v) {
    var l = lower(v);
    return (
      l.indexOf('tenant') >= 0 ||
      l.indexOf('appkey') >= 0 ||
      l.indexOf('app_key') >= 0 ||
      l.indexOf('authorization') >= 0 ||
      l.indexOf('access') >= 0 ||
      l.indexOf('refresh') >= 0 ||
      l.indexOf('token') >= 0 ||
      l.indexOf('deviceid') >= 0 ||
      l.indexOf('device_id') >= 0 ||
      l.indexOf('encrypt') >= 0 ||
      l.indexOf('decrypt') >= 0 ||
      l.indexOf('request_e') >= 0 ||
      l.indexOf('response_e') >= 0 ||
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c') >= 0
    );
  }

  function interestingChannel(v) {
    var l = lower(v);
    return (
      l.indexOf('flutter') >= 0 ||
      l.indexOf('gs') >= 0 ||
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('app') >= 0
    );
  }

  function interestingMethod(v) {
    var l = lower(v);
    return (
      l.indexOf('access') >= 0 ||
      l.indexOf('token') >= 0 ||
      l.indexOf('device') >= 0 ||
      l.indexOf('tenant') >= 0 ||
      l.indexOf('appkey') >= 0 ||
      l.indexOf('encrypt') >= 0 ||
      l.indexOf('decrypt') >= 0 ||
      l.indexOf('localdata') >= 0 ||
      l.indexOf('server') >= 0 ||
      l.indexOf('buildnumber') >= 0
    );
  }

  function interestingHeader(k) {
    var l = lower(k);
    return (
      l.indexOf('authorization') >= 0 ||
      l.indexOf('x-tenant') >= 0 ||
      l.indexOf('tenant') >= 0 ||
      l.indexOf('appkey') >= 0 ||
      l.indexOf('app-key') >= 0 ||
      l.indexOf('device') >= 0
    );
  }

  function logHeader(tag, key, value) {
    var lk = lower(key);
    if (lk.indexOf('authorization') >= 0) {
      log(tag + ' ' + safe(key) + '=' + mask(value));
      return;
    }
    log(tag + ' ' + safe(key) + '=' + preview(value));
  }

  try {
    var MethodChannel = Java.use('io.flutter.plugin.common.MethodChannel');
    var invoke2 = MethodChannel.invokeMethod.overload(
      'java.lang.String',
      'java.lang.Object',
    );
    invoke2.implementation = function (method, args) {
      if (interestingMethod(method) || interestingKey(args)) {
        log(
          '[MethodChannel.invokeMethod] method=' +
            safe(method) +
            ' args=' +
            preview(args),
        );
      }
      return invoke2.call(this, method, args);
    };
    log('[+] MethodChannel.invokeMethod hook active');
  } catch (e) {
    log('[-] MethodChannel hook failed: ' + e);
  }

  try {
    var MethodCall = Java.use('io.flutter.plugin.common.MethodCall');
    var argument = MethodCall.argument.overload('java.lang.String');
    argument.implementation = function (key) {
      var ret = argument.call(this, key);
      if (interestingKey(key) || interestingMethod(this.method.value)) {
        log(
          '[MethodCall.argument] method=' +
            safe(this.method.value) +
            ' key=' +
            safe(key) +
            ' ret=' +
            preview(ret),
        );
      }
      return ret;
    };
    log('[+] MethodCall.argument hook active');
  } catch (e) {
    log('[-] MethodCall.argument hook failed: ' + e);
  }

  try {
    var Messenger = Java.use('io.flutter.embedding.engine.dart.DartMessenger');
    var send = Messenger.send.overload(
      'java.lang.String',
      'java.nio.ByteBuffer',
      'io.flutter.plugin.common.BinaryMessenger$BinaryReply',
    );
    send.implementation = function (channel, message, callback) {
      if (interestingChannel(channel)) {
        var size = 0;
        try {
          size = message ? message.remaining() : 0;
        } catch (e) {}
        log('[DartMessenger.send] channel=' + safe(channel) + ' size=' + size);
      }
      return send.call(this, channel, message, callback);
    };
    log('[+] DartMessenger.send hook active');
  } catch (e) {
    log('[-] DartMessenger.send hook failed: ' + e);
  }

  try {
    var SPImpl = Java.use('android.app.SharedPreferencesImpl');
    var getString = SPImpl.getString.overload('java.lang.String', 'java.lang.String');
    getString.implementation = function (key, defValue) {
      var ret = getString.call(this, key, defValue);
      if (interestingKey(key)) {
        log('[SharedPreferences.getString] key=' + safe(key) + ' ret=' + mask(ret));
      }
      return ret;
    };
    log('[+] SharedPreferencesImpl.getString hook active');
  } catch (e) {
    log('[-] SharedPreferencesImpl hook failed: ' + e);
  }

  try {
    var ReqBuilder = Java.use('okhttp3.Request$Builder');
    var addHeader = ReqBuilder.addHeader.overload('java.lang.String', 'java.lang.String');
    addHeader.implementation = function (k, v) {
      if (interestingHeader(k)) {
        logHeader('[okhttp.header]', k, v);
      }
      return addHeader.call(this, k, v);
    };
    log('[+] okhttp header hook active');
  } catch (e) {
    log('[-] okhttp header hook failed: ' + e);
  }

  try {
    var CronetBuilder = Java.use('org.chromium.net.UrlRequest$Builder');
    var addHdr = CronetBuilder.addHeader.overload('java.lang.String', 'java.lang.String');
    addHdr.implementation = function (k, v) {
      if (interestingHeader(k)) {
        logHeader('[cronet.header]', k, v);
      }
      return addHdr.call(this, k, v);
    };
    log('[+] Cronet header hook active');
  } catch (e) {
    log('[-] Cronet header hook failed: ' + e);
  }

  try {
    var URL = Java.use('java.net.URL');
    var init1 = URL.$init.overload('java.lang.String');
    init1.implementation = function (spec) {
      if (interestingKey(spec)) {
        log('[URL] ' + preview(spec));
      }
      return init1.call(this, spec);
    };
    log('[+] URL hook active');
  } catch (e) {
    log('[-] URL hook failed: ' + e);
  }

  log('[+] gs25-b2c-bootstrap-probe ready');
});
