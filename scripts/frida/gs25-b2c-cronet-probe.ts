/*
 * GS25 b2c Cronet 정밀 프로브
 *
 * 목적:
 * - Cronet 요청 생성 지점에서 URL/헤더/메서드를 직접 수집
 * - b2c-apigw/b2c-bff 호출 직전 인자를 확보
 */

Java.perform(function () {
  var LOG_LIMIT = 4000;
  var logCount = 0;

  function log(msg) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    console.log(msg);
  }

  function safe(v) {
    try {
      if (v === null || v === undefined) return 'null';
      return v.toString();
    } catch (e) {
      return '<err:' + e + '>';
    }
  }

  function isInterestingUrl(u) {
    if (!u) return false;
    var l = ('' + u).toLowerCase();
    return (
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c-') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('msg-api') >= 0 ||
      l.indexOf('http://') === 0 ||
      l.indexOf('https://') === 0
    );
  }

  function hookIfExists(className, methodName, onOverload) {
    try {
      var C = Java.use(className);
      if (!C[methodName] || !C[methodName].overloads) return false;
      var ovs = C[methodName].overloads;
      for (var i = 0; i < ovs.length; i++) {
        onOverload(ovs[i], className, methodName, i);
      }
      log('[+] hook ' + className + '.' + methodName + ' (' + ovs.length + ')');
      return true;
    } catch (e) {
      return false;
    }
  }

  // 1) 공용 UrlRequest.Builder
  hookIfExists('org.chromium.net.UrlRequest$Builder', 'setHttpMethod', function (ov, c, m, i) {
    ov.implementation = function (method) {
      log('[Cronet.method] ' + safe(method));
      return ov.call(this, method);
    };
  });

  hookIfExists('org.chromium.net.UrlRequest$Builder', 'addHeader', function (ov, c, m, i) {
    ov.implementation = function (k, v) {
      var ks = safe(k);
      if (ks.toLowerCase().indexOf('authorization') >= 0 || ks.toLowerCase().indexOf('x-') >= 0) {
        log('[Cronet.header] ' + ks + '=' + safe(v));
      }
      return ov.call(this, k, v);
    };
  });

  hookIfExists('org.chromium.net.UrlRequest$Builder', 'build', function (ov, c, m, i) {
    ov.implementation = function () {
      log('[Cronet.build] UrlRequest build');
      return ov.call(this);
    };
  });

  // 2) 실제 구현체 Context 빌더
  hookIfExists(
    'org.chromium.net.impl.CronetUrlRequestContext',
    'newUrlRequestBuilder',
    function (ov, c, m, i) {
      ov.implementation = function () {
        var url = arguments.length > 0 ? safe(arguments[0]) : '';
        if (isInterestingUrl(url)) {
          log('[Cronet.newBuilder] ' + url + ' ov=' + i);
        }
        return ov.apply(this, arguments);
      };
    },
  );

  // 3) impl 빌더 생성자 시도
  try {
    var ImplBuilder = Java.use('org.chromium.net.impl.CronetUrlRequestBuilderImpl');
    var inits = ImplBuilder.$init.overloads;
    for (var j = 0; j < inits.length; j++) {
      (function (ov, idx) {
        ov.implementation = function () {
          var url = arguments.length > 0 ? safe(arguments[0]) : '';
          if (isInterestingUrl(url)) {
            log('[CronetImpl.<init>] ' + url + ' ov=' + idx);
          }
          return ov.apply(this, arguments);
        };
      })(inits[j], j);
    }
    log('[+] hook org.chromium.net.impl.CronetUrlRequestBuilderImpl.$init (' + inits.length + ')');
  } catch (e) {
    log('[-] CronetUrlRequestBuilderImpl not found');
  }

  // 4) okhttp 폴백 (클래스 존재 시)
  hookIfExists('okhttp3.Request$Builder', 'url', function (ov, c, m, i) {
    if (ov.argumentTypes.length === 1 && ov.argumentTypes[0].className === 'java.lang.String') {
      ov.implementation = function (u) {
        var us = safe(u);
        if (isInterestingUrl(us)) log('[okhttp.url] ' + us);
        return ov.call(this, u);
      };
    }
  });

  // 5) URL 생성자(최소 보조)
  hookIfExists('java.net.URL', '$init', function (ov, c, m, i) {
    if (ov.argumentTypes.length === 1 && ov.argumentTypes[0].className === 'java.lang.String') {
      ov.implementation = function (u) {
        var us = safe(u);
        if (isInterestingUrl(us)) log('[URL] ' + us);
        return ov.call(this, u);
      };
    }
  });

  log('[+] gs25-b2c-cronet-probe ready');
});
