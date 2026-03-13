/*
 * GS25 WebView callHandler 프로브
 *
 * 목적:
 * - flutter_inappwebview의 JavaScriptBridgeInterface._callHandler를 직접 후킹해
 *   JS -> 앱 방향 브리지 메시지를 평문으로 관찰
 * - 지도 관련 이벤트(`onMarkerClick`, `onIdle`, `onDragStart/End`, `onZoomChanged`)
 *   및 일반 핸들러명/인자를 기록
 */

Java.perform(function () {
  var LOG_LIMIT = 3000;
  var logCount = 0;
  var MAX_PREVIEW = 1200;

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
      l.indexOf('onidle') >= 0 ||
      l.indexOf('ondragstart') >= 0 ||
      l.indexOf('ondragend') >= 0 ||
      l.indexOf('onzoomchanged') >= 0 ||
      l.indexOf('callasyncjavascript') >= 0 ||
      l.indexOf('store') >= 0 ||
      l.indexOf('marker') >= 0 ||
      l.indexOf('latlng') >= 0 ||
      l.indexOf('level') >= 0 ||
      l.indexOf('ve463') >= 0 ||
      l.indexOf('vn115') >= 0 ||
      l.indexOf('servicecode') >= 0
    );
  }

  try {
    var Bridge = Java.use(
      'com.pichillilorenzo.flutter_inappwebview_android.webview.JavaScriptBridgeInterface',
    );

    if (Bridge._callHandler && Bridge._callHandler.overloads) {
      var ovs = Bridge._callHandler.overloads;
      for (var i = 0; i < ovs.length; i++) {
        (function (ov, idx) {
          ov.implementation = function () {
            var parts = [];
            var matched = false;
            for (var a = 0; a < arguments.length; a++) {
              var av = safe(arguments[a]);
              parts.push('arg' + a + '=' + preview(av));
              if (interesting(av)) {
                matched = true;
              }
            }
            if (matched) {
              log('[JavaScriptBridgeInterface._callHandler ov=' + idx + ']\n' + parts.join('\n'));
            }
            return ov.apply(this, arguments);
          };
        })(ovs[i], i);
      }
      log('[+] JavaScriptBridgeInterface._callHandler hook active (' + ovs.length + ')');
    } else {
      log('[-] JavaScriptBridgeInterface._callHandler not found');
    }
  } catch (e) {
    log('[-] JavaScriptBridgeInterface hook failed: ' + e);
  }

  log('[+] gs25-webview-callhandler-probe ready');
});
