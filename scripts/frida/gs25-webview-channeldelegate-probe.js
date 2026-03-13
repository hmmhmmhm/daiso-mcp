/*
 * GS25 WebView ChannelDelegate 프로브
 *
 * 목적:
 * - JavaScriptBridgeInterface._callHandler 이후 전달되는
 *   WebViewChannelDelegate.onCallJsHandler(name, args, callback)를 캡처
 * - JS -> 앱 브리지 입력값이 Flutter 채널로 넘어가기 직전의 평문을 확인
 */

Java.perform(function () {
  var LOG_LIMIT = 4000;
  var logCount = 0;
  var MAX_PREVIEW = 2000;

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

  function interesting(v) {
    var l = safe(v).toLowerCase();
    return (
      l.indexOf('onmarkerclick') >= 0 ||
      l.indexOf('ondragstart') >= 0 ||
      l.indexOf('ondragend') >= 0 ||
      l.indexOf('onzoom') >= 0 ||
      l.indexOf('onidle') >= 0 ||
      l.indexOf('store') >= 0 ||
      l.indexOf('marker') >= 0 ||
      l.indexOf('lat') >= 0 ||
      l.indexOf('lng') >= 0 ||
      l.indexOf('ve463') >= 0 ||
      l.indexOf('vn115') >= 0 ||
      l.indexOf('callasyncjavascript') >= 0
    );
  }

  try {
    var Delegate = Java.use(
      'com.pichillilorenzo.flutter_inappwebview_android.webview.WebViewChannelDelegate',
    );

    var onCallJsHandler = Delegate.onCallJsHandler.overload(
      'java.lang.String',
      'java.lang.String',
      'com.pichillilorenzo.flutter_inappwebview_android.webview.WebViewChannelDelegate$CallJsHandlerCallback',
    );

    onCallJsHandler.implementation = function (name, args, callback) {
      var n = safe(name);
      var a = safe(args);
      if (interesting(n) || interesting(a)) {
        log('[WebViewChannelDelegate.onCallJsHandler]');
        log('name=' + preview(n));
        log('args=' + preview(a));
      }
      return onCallJsHandler.call(this, name, args, callback);
    };

    log('[+] WebViewChannelDelegate.onCallJsHandler hook active');
  } catch (e) {
    log('[-] WebViewChannelDelegate hook failed: ' + e);
  }

  log('[+] gs25-webview-channeldelegate-probe ready');
});
