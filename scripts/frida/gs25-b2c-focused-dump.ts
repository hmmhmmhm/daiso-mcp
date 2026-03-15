/*
 * GS25 b2c 포커스 덤프 스크립트
 *
 * 목적:
 * - 난독 클래스 전체를 무차별 후킹하지 않고,
 *   문자열/JSON/바이트 경계 메서드만 선별 후킹해 평문 단서를 확보
 */

Java.perform(function () {
  var LOG_LIMIT = 5000;
  var logCount = 0;
  var MAX_PREVIEW = 500;

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

  function bytesToUtf8(arr) {
    if (!arr) return '';
    try {
      var JString = Java.use('java.lang.String');
      return JString.$new(arr, 'UTF-8').toString();
    } catch (e) {
      return '';
    }
  }

  function normalize(arg) {
    if (arg === null || arg === undefined) return 'null';
    try {
      var cls = arg.getClass ? arg.getClass().getName() : typeof arg;
      if (cls === '[B') return bytesToUtf8(arg);
      return safeToString(arg);
    } catch (e) {
      return safeToString(arg);
    }
  }

  function looksInteresting(text) {
    if (!text) return false;
    var l = ('' + text).toLowerCase();
    return (
      l.indexOf('b2c') >= 0 ||
      l.indexOf('woodongs') >= 0 ||
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

  function isInterestingType(typeName) {
    if (!typeName) return false;
    return (
      typeName === 'java.lang.String' ||
      typeName === 'org.json.JSONObject' ||
      typeName === 'org.json.JSONArray' ||
      typeName === '[B' ||
      typeName.indexOf('java.util.Map') >= 0 ||
      typeName.indexOf('java.util.List') >= 0
    );
  }

  function hookFocusedMethods(className) {
    try {
      var Clazz = Java.use(className);
      var methods = Clazz.class.getDeclaredMethods();
      var seen = {};

      for (var i = 0; i < methods.length; i++) {
        var m = methods[i];
        var name = m.getName();
        if (!Clazz[name] || !Clazz[name].overloads) continue;

        var retType = m.getReturnType().getName();
        var paramTypes = m.getParameterTypes();
        var hasInterestingParam = false;
        for (var p = 0; p < paramTypes.length; p++) {
          if (isInterestingType(paramTypes[p].getName())) {
            hasInterestingParam = true;
            break;
          }
        }
        if (!isInterestingType(retType) && !hasInterestingParam) continue;

        var key = name + ':' + retType + ':' + paramTypes.length;
        if (seen[key]) continue;
        seen[key] = true;

        var overloads = Clazz[name].overloads;
        for (var o = 0; o < overloads.length; o++) {
          (function (ov, methodName, rType) {
            ov.implementation = function () {
              var lines = [];
              var matched = false;

              for (var a = 0; a < arguments.length; a++) {
                var av = normalize(arguments[a]);
                lines.push('arg' + a + '=' + preview(av));
                if (looksInteresting(av)) matched = true;
              }

              var ret = ov.apply(this, arguments);
              var rv = normalize(ret);
              if (looksInteresting(rv)) matched = true;

              if (matched) {
                log(
                  '\n[FOCUSED_HOOK] class=' +
                    className +
                    ' method=' +
                    methodName +
                    ' retType=' +
                    rType +
                    '\n' +
                    lines.join('\n') +
                    '\nret=' +
                    preview(rv),
                );
              }
              return ret;
            };
          })(overloads[o], name, retType);
        }
      }

      log('[+] focused hook ready: ' + className);
    } catch (e) {
      log('[-] focused hook fail ' + className + ': ' + e);
    }
  }

  function hookWebViewBridge() {
    try {
      var WebView = Java.use('android.webkit.WebView');
      var addJs = WebView.addJavascriptInterface.overload('java.lang.Object', 'java.lang.String');
      addJs.implementation = function (obj, name) {
        var objCls = 'unknown';
        try {
          objCls = obj.getClass().getName();
        } catch (e) {}
        log('[WebViewBridge] addJavascriptInterface name=' + name + ' class=' + objCls);
        return addJs.call(this, obj, name);
      };
      log('[+] WebView addJavascriptInterface hook active');
    } catch (e) {
      log('[-] WebView bridge hook fail: ' + e);
    }
  }

  function hookFlutterMethodChannel() {
    try {
      var MethodChannel = Java.use('io.flutter.plugin.common.MethodChannel');
      var invoke1 = MethodChannel.invokeMethod.overload(
        'java.lang.String',
        'java.lang.Object',
      );
      invoke1.implementation = function (method, args) {
        var m = safeToString(method);
        var a = normalize(args);
        if (looksInteresting(m) || looksInteresting(a)) {
          log('[Flutter.invokeMethod] method=' + m + ' args=' + preview(a));
        }
        return invoke1.call(this, method, args);
      };
      log('[+] Flutter MethodChannel hook active');
    } catch (e) {
      log('[-] Flutter MethodChannel hook fail: ' + e);
    }
  }

  var targets = ['S5.d', 'S5.m', 'K5.c$a', 'L5.b', 'E5.n', 'G5.b', 'F5.d$b'];
  for (var i = 0; i < targets.length; i++) {
    hookFocusedMethods(targets[i]);
  }

  hookWebViewBridge();
  hookFlutterMethodChannel();
  log('[+] gs25-b2c-focused-dump ready');
});
