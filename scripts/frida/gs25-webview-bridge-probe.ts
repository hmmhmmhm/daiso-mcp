/*
 * GS25 WebView / JS bridge 프로브
 *
 * 목적:
 * - `flutter_inappwebview` 기반 상세/지도 화면에서
 *   HTML/JS/브리지 메시지가 어떤 경계로 주입되는지 관찰
 * - `data:` HTML, `javascript:` URL, `evaluateJavascript`,
 *   `addJavascriptInterface`, `postWebMessage`를 선별 기록
 */

Java.perform(function () {
  var LOG_LIMIT = 3000;
  var logCount = 0;
  var MAX_PREVIEW = 500;
  var MAX_PAYLOAD_PREVIEW = 3000;

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

  function payloadPreview(v) {
    var s = safe(v).replace(/\s+/g, ' ').trim();
    if (s.length <= MAX_PAYLOAD_PREVIEW) {
      return s;
    }
    return s.slice(0, MAX_PAYLOAD_PREVIEW) + '...';
  }

  function normalizeUrlCandidate(v) {
    return safe(v).trim().toLowerCase();
  }

  function extractUrlHost(v) {
    var candidate = normalizeUrlCandidate(v);
    var match;
    if (!candidate) {
      return '';
    }
    if (
      candidate.indexOf('javascript:') === 0 ||
      candidate.indexOf('vbscript:') === 0 ||
      candidate.indexOf('data:') === 0
    ) {
      return '';
    }
    if (candidate.indexOf('//') === 0) {
      candidate = 'https:' + candidate;
    }
    match = candidate.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/);
    if (!match) {
      return '';
    }
    return match[1].replace(/:\d+$/, '');
  }

  function hostEqualsOrSubdomain(host, domain) {
    return !!host && (host === domain || host.endsWith('.' + domain));
  }

  function hasExecutableUrlScheme(v) {
    var candidate = normalizeUrlCandidate(v);
    return (
      candidate.indexOf('javascript:') === 0 ||
      candidate.indexOf('vbscript:') === 0 ||
      candidate.indexOf('data:') === 0
    );
  }

  function looksInteresting(v) {
    var l = safe(v).toLowerCase();
    return (
      hasExecutableUrlScheme(v) ||
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c') >= 0 ||
      l.indexOf('stock') >= 0 ||
      l.indexOf('store') >= 0 ||
      l.indexOf('goods') >= 0 ||
      l.indexOf('keyword') >= 0 ||
      l.indexOf('product') >= 0 ||
      l.indexOf('tenant') >= 0 ||
      l.indexOf('appkey') >= 0 ||
      l.indexOf('request_e') >= 0 ||
      l.indexOf('response_e') >= 0 ||
      l.indexOf('{') >= 0 ||
      l.indexOf('[') >= 0
    );
  }

  function isNoise(v) {
    var host = extractUrlHost(v);
    var l = safe(v).toLowerCase();
    return (
      hostEqualsOrSubdomain(host, 'googleads.g.doubleclick.net') ||
      hostEqualsOrSubdomain(host, 'doubleclick.net') ||
      hostEqualsOrSubdomain(host, 'googleadservices.com') ||
      l.indexOf('google.afma') >= 0 ||
      l.indexOf('omidbridge') >= 0 ||
      l.indexOf('adsjsinterface') >= 0
    );
  }

  function shouldLogHtml(data) {
    var l = normalizeUrlCandidate(data);
    return l.indexOf('data:text/html') === 0 || l.indexOf('<html') >= 0;
  }

  try {
    var WebView = Java.use('android.webkit.WebView');

    var addJs = WebView.addJavascriptInterface.overload('java.lang.Object', 'java.lang.String');
    addJs.implementation = function (obj, name) {
      var objCls = 'unknown';
      try {
        objCls = obj.getClass().getName();
      } catch (e) {}
      if (!isNoise(name) && !isNoise(objCls)) {
        log('[WebView.addJavascriptInterface] name=' + safe(name) + ' class=' + objCls);
      }
      return addJs.call(this, obj, name);
    };

    var loadUrl1 = WebView.loadUrl.overload('java.lang.String');
    loadUrl1.implementation = function (url) {
      if (looksInteresting(url) && !isNoise(url)) {
        log('[WebView.loadUrl] ' + preview(url));
      }
      return loadUrl1.call(this, url);
    };

    var loadUrl2 = WebView.loadUrl.overload('java.lang.String', 'java.util.Map');
    loadUrl2.implementation = function (url, headers) {
      if ((looksInteresting(url) || looksInteresting(headers)) && !isNoise(url) && !isNoise(headers)) {
        log('[WebView.loadUrl+headers] url=' + preview(url) + ' headers=' + preview(headers));
      }
      return loadUrl2.call(this, url, headers);
    };

    var loadData = WebView.loadData.overload(
      'java.lang.String',
      'java.lang.String',
      'java.lang.String',
    );
    loadData.implementation = function (data, mimeType, encoding) {
      if (shouldLogHtml(data) && !isNoise(data)) {
        log(
          '[WebView.loadData] mimeType=' +
            safe(mimeType) +
            ' encoding=' +
            safe(encoding) +
            ' data=' +
            preview(data),
        );
      }
      return loadData.call(this, data, mimeType, encoding);
    };

    var loadDataBase = WebView.loadDataWithBaseURL.overload(
      'java.lang.String',
      'java.lang.String',
      'java.lang.String',
      'java.lang.String',
      'java.lang.String',
    );
    loadDataBase.implementation = function (baseUrl, data, mimeType, encoding, historyUrl) {
      if ((shouldLogHtml(data) || looksInteresting(baseUrl)) && !isNoise(data) && !isNoise(baseUrl)) {
        log(
          '[WebView.loadDataWithBaseURL] baseUrl=' +
            safe(baseUrl) +
            ' mimeType=' +
            safe(mimeType) +
            ' encoding=' +
            safe(encoding) +
            ' historyUrl=' +
            safe(historyUrl) +
            ' data=' +
            preview(data),
        );
      }
      return loadDataBase.call(this, baseUrl, data, mimeType, encoding, historyUrl);
    };

    var evalJs = WebView.evaluateJavascript.overload(
      'java.lang.String',
      'android.webkit.ValueCallback',
    );
    evalJs.implementation = function (script, callback) {
      if (looksInteresting(script) && !isNoise(script)) {
        if (
          safe(script).indexOf('setAllStoreMarker(') >= 0 ||
          safe(script).indexOf('onMarkerClick(') >= 0 ||
          safe(script).indexOf('setMyLocationMarker(') >= 0 ||
          safe(script).indexOf('setCenter(') >= 0 ||
          safe(script).indexOf('setLevel(') >= 0
        ) {
          log('[WebView.evaluateJavascript] ' + payloadPreview(script));
        } else {
          log('[WebView.evaluateJavascript] ' + preview(script));
        }
      }
      return evalJs.call(this, script, callback);
    };

    try {
      var postMsg = WebView.postWebMessage.overload(
        'android.webkit.WebMessage',
        'android.net.Uri',
      );
      postMsg.implementation = function (message, targetOrigin) {
        var data = message ? message.getData() : 'null';
        if (!isNoise(data) && !isNoise(targetOrigin)) {
          log(
            '[WebView.postWebMessage] data=' +
              preview(data) +
              ' target=' +
              safe(targetOrigin),
          );
        }
        return postMsg.call(this, message, targetOrigin);
      };
    } catch (e) {}

    log('[+] WebView probe hooks active');
  } catch (e) {
    log('[-] WebView probe setup failed: ' + e);
  }

  try {
    var WebMessagePort = Java.use('android.webkit.WebMessagePort');
    var postMessage = WebMessagePort.postMessage.overload('android.webkit.WebMessage');
    postMessage.implementation = function (message) {
      var data = message ? message.getData() : 'null';
      if (!isNoise(data)) {
        log('[WebMessagePort.postMessage] data=' + preview(data));
      }
      return postMessage.call(this, message);
    };
    log('[+] WebMessagePort.postMessage hook active');
  } catch (e) {
    log('[-] WebMessagePort hook failed: ' + e);
  }

  log('[+] gs25-webview-bridge-probe ready');
});
