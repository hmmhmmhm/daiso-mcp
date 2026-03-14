/*
 * 세븐일레븐 WebView 최소 리플레이 추출기
 *
 * 목적:
 * - AppIron 탐지 리스크를 줄이기 위해 최소 범위만 후킹
 * - WebView URL 이동과 evaluateJavascript 주입 payload를 기록
 * - 리플레이에 필요한 URL/함수 인자 후보를 JSON 형태로 출력
 */

Java.perform(function () {
  var LOG_LIMIT = 3000;
  var logCount = 0;

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
        return '';
      }
      return v.toString();
    } catch (e) {
      return '';
    }
  }

  function preview(v, maxLen) {
    var s = safe(v).replace(/\s+/g, ' ').trim();
    if (s.length <= maxLen) {
      return s;
    }
    return s.slice(0, maxLen) + '...';
  }

  function emit(type, payload) {
    var out = {
      t: type,
      ts: Date.now(),
      payload: payload,
    };
    log('[SE_REPLAY] ' + JSON.stringify(out));
  }

  function parseFunctionCall(script, fnName) {
    var re = new RegExp(fnName + '\\(([^)]*)\\)');
    var m = safe(script).match(re);
    return m ? m[1] : null;
  }

  function interestingScript(script) {
    var s = safe(script).toLowerCase();
    return (
      s.indexOf('set') >= 0 ||
      s.indexOf('marker') >= 0 ||
      s.indexOf('store') >= 0 ||
      s.indexOf('product') >= 0 ||
      s.indexOf('stock') >= 0 ||
      s.indexOf('inventory') >= 0 ||
      s.indexOf('barcode') >= 0 ||
      s.indexOf('kakao') >= 0 ||
      s.indexOf('7-eleven') >= 0 ||
      s.indexOf('7eleven') >= 0
    );
  }

  function interestingUrl(url) {
    var u = safe(url).toLowerCase();
    return (
      u.indexOf('7-elevenapp.co.kr') >= 0 ||
      u.indexOf('7-eleven.co.kr') >= 0 ||
      u.indexOf('kakao') >= 0 ||
      u.indexOf('/store') >= 0 ||
      u.indexOf('/product') >= 0 ||
      u.indexOf('/stock') >= 0 ||
      u.indexOf('/inventory') >= 0
    );
  }

  try {
    var WebView = Java.use('android.webkit.WebView');

    var loadUrl1 = WebView.loadUrl.overload('java.lang.String');
    loadUrl1.implementation = function (url) {
      if (interestingUrl(url)) {
        emit('load_url', { url: safe(url) });
      }
      return loadUrl1.call(this, url);
    };

    var loadUrl2 = WebView.loadUrl.overload('java.lang.String', 'java.util.Map');
    loadUrl2.implementation = function (url, headers) {
      if (interestingUrl(url)) {
        emit('load_url_headers', {
          url: safe(url),
          headers: preview(headers, 1200),
        });
      }
      return loadUrl2.call(this, url, headers);
    };

    var evalJs = WebView.evaluateJavascript.overload(
      'java.lang.String',
      'android.webkit.ValueCallback',
    );
    evalJs.implementation = function (script, callback) {
      if (interestingScript(script)) {
        emit('evaluate_js', { script: preview(script, 3500) });

        var fnNames = ['setCenter', 'setLevel', 'setMarker', 'setStore', 'onMarkerClick'];
        for (var i = 0; i < fnNames.length; i++) {
          var args = parseFunctionCall(script, fnNames[i]);
          if (args !== null) {
            emit('js_fn', { name: fnNames[i], args: preview(args, 2000) });
          }
        }
      }
      return evalJs.call(this, script, callback);
    };

    emit('ready', { hook: 'webview-minimal', version: 1 });
  } catch (e) {
    emit('error', { stage: 'setup', message: safe(e) });
  }
});
