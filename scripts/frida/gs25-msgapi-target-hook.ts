/*
 * GS25 msg-api 타깃 후킹 스크립트
 *
 * 목표:
 * - 이전 프로브에서 확인된 난독화 클래스(S5/K5/L5/E5/G5/F5) 메서드 직접 후킹
 * - msg-api 관련 문자열/바이트 페이로드를 최대한 평문으로 관찰
 */

Java.perform(function () {
  var LOG_LIMIT = 4000;
  var logCount = 0;
  var MAX_PREVIEW = 300;

  function log(msg) {
    if (logCount >= LOG_LIMIT) {
      return;
    }
    logCount += 1;
    console.log(msg);
  }

  function safeToString(v) {
    try {
      if (v === null || v === undefined) {
        return 'null';
      }
      return v.toString();
    } catch (e) {
      return '<toString-error:' + e + '>';
    }
  }

  function bytesToUtf8(arr) {
    if (!arr) {
      return '';
    }
    try {
      var JString = Java.use('java.lang.String');
      return JString.$new(arr, 'UTF-8').toString();
    } catch (e) {
      return '';
    }
  }

  function preview(s) {
    if (!s) {
      return '';
    }
    var one = s.replace(/\s+/g, ' ').trim();
    if (one.length <= MAX_PREVIEW) {
      return one;
    }
    return one.slice(0, MAX_PREVIEW) + '...';
  }

  function stringifyMap(mapObj) {
    try {
      var out = [];
      var iter = mapObj.entrySet().iterator();
      var n = 0;
      while (iter.hasNext() && n < 20) {
        var e = iter.next();
        var k = safeToString(e.getKey());
        var v = safeToString(e.getValue());
        out.push(k + '=' + v);
        n += 1;
      }
      return '{' + out.join(', ') + (iter.hasNext() ? ', ...' : '') + '}';
    } catch (e) {
      return '<map-error:' + e + '>';
    }
  }

  function stringifyList(listObj) {
    try {
      var size = listObj.size();
      var out = [];
      var n = size < 20 ? size : 20;
      for (var i = 0; i < n; i++) {
        out.push(safeToString(listObj.get(i)));
      }
      return '[' + out.join(', ') + (size > 20 ? ', ...' : '') + ']';
    } catch (e) {
      return '<list-error:' + e + '>';
    }
  }

  function stringifyPojoFields(obj) {
    try {
      var clazz = obj.getClass();
      var fields = clazz.getDeclaredFields();
      var out = [];
      var n = fields.length < 20 ? fields.length : 20;
      for (var i = 0; i < n; i++) {
        var f = fields[i];
        try {
          f.setAccessible(true);
          var name = safeToString(f.getName());
          var val = f.get(obj);
          out.push(name + '=' + safeToString(val));
        } catch (e2) {
          out.push('<field-error>');
        }
      }
      return 'fields{' + out.join(', ') + (fields.length > 20 ? ', ...' : '') + '}';
    } catch (e) {
      return '<pojo-error:' + e + '>';
    }
  }

  function argToRichText(arg) {
    if (arg === null || arg === undefined) {
      return 'null';
    }
    try {
      var cls = arg.getClass ? arg.getClass().getName() : '';
      if (cls === '[B') {
        return bytesToUtf8(arg);
      }
      if (cls === 'java.lang.String') {
        return safeToString(arg);
      }
      if (cls.indexOf('java.util.HashMap') >= 0 || cls.indexOf('java.util.LinkedHashMap') >= 0) {
        return stringifyMap(arg);
      }
      if (cls.indexOf('java.util.ArrayList') >= 0 || cls.indexOf('java.util.List') >= 0) {
        return stringifyList(arg);
      }
      if (cls === 'org.json.JSONObject' || cls === 'org.json.JSONArray') {
        return safeToString(arg);
      }
      if (
        cls.indexOf('S5.') === 0 ||
        cls.indexOf('K5.') === 0 ||
        cls.indexOf('L5.') === 0 ||
        cls.indexOf('E5.') === 0 ||
        cls.indexOf('G5.') === 0 ||
        cls.indexOf('F5.') === 0
      ) {
        return safeToString(arg) + ' ' + stringifyPojoFields(arg);
      }
      return safeToString(arg);
    } catch (e) {
      return safeToString(arg);
    }
  }

  function looksInteresting(s) {
    if (!s) {
      return false;
    }
    var l = s.toLowerCase();
    return (
      l.indexOf('msg-api') >= 0 ||
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('stock') >= 0 ||
      l.indexOf('inventory') >= 0 ||
      l.indexOf('goods') >= 0 ||
      l.indexOf('product') >= 0 ||
      l.indexOf('store') >= 0 ||
      l.indexOf('barcode') >= 0 ||
      l.indexOf('devicecert') >= 0 ||
      l.indexOf('setconfig') >= 0 ||
      l.indexOf('login') >= 0 ||
      l.indexOf('d=') >= 0 ||
      l.indexOf('{') >= 0 ||
      l.indexOf('}') >= 0
    );
  }

  function logEvent(title, lines) {
    log('\n=== ' + title + ' ===\n' + lines.join('\n') + '\n=== /' + title + ' ===');
  }

  // SSL 우회(기본)
  try {
    var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
    var SSLContext = Java.use('javax.net.ssl.SSLContext');

    var TrustManager = Java.registerClass({
      name: 'com.codex.gs25.TargetTrustAll',
      implements: [X509TrustManager],
      methods: {
        checkClientTrusted: function (chain, authType) {},
        checkServerTrusted: function (chain, authType) {},
        getAcceptedIssuers: function () {
          return [];
        },
      },
    });

    var trustManagers = [TrustManager.$new()];
    var SSLContextInit = SSLContext.init.overload(
      '[Ljavax.net.ssl.KeyManager;',
      '[Ljavax.net.ssl.TrustManager;',
      'java.security.SecureRandom',
    );
    SSLContextInit.implementation = function (km, tm, sr) {
      SSLContextInit.call(this, km, trustManagers, sr);
    };
    log('[+] SSLContext bypass active');
  } catch (e) {
    log('[-] SSLContext bypass failed: ' + e);
  }

  try {
    var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
    TrustManagerImpl.verifyChain.implementation = function (
      untrustedChain,
      trustAnchorChain,
      host,
      clientAuth,
      ocspData,
      tlsSctData,
    ) {
      if (host) {
        log('[TLS] host=' + host);
      }
      return untrustedChain;
    };
  } catch (e) {
    log('[-] TrustManagerImpl hook failed: ' + e);
  }

  // WebView SSL 에러 강제 진행
  try {
    var SslErrorHandler = Java.use('android.webkit.SslErrorHandler');
    var proceed = SslErrorHandler.proceed.overload();
    proceed.implementation = function () {
      log('[WebView] SslErrorHandler.proceed()');
      return proceed.call(this);
    };

    var WebViewClient = Java.use('android.webkit.WebViewClient');
    var onReceivedSslError = WebViewClient.onReceivedSslError.overload(
      'android.webkit.WebView',
      'android.webkit.SslErrorHandler',
      'android.net.http.SslError',
    );
    onReceivedSslError.implementation = function (view, handler, error) {
      try {
        var p = error ? safeToString(error.toString()) : 'null';
        log('[WebView] onReceivedSslError: ' + p);
        handler.proceed();
      } catch (e2) {
        log('[-] onReceivedSslError handler failed: ' + e2);
      }
      return;
    };
    log('[+] WebView SSL error bypass active');
  } catch (e) {
    log('[-] WebView SSL bypass hook failed: ' + e);
  }

  // URL 추적
  try {
    var URL = Java.use('java.net.URL');
    var URLCtor = URL.$init.overload('java.lang.String');
    URLCtor.implementation = function (spec) {
      var ret = URLCtor.call(this, spec);
      var s = safeToString(spec);
      if (looksInteresting(s)) {
        log('[URL] ' + s);
      }
      return ret;
    };
  } catch (e) {
    log('[-] URL hook failed: ' + e);
  }

  // WebView 상태 덤프 (app_error/login 분기 추적)
  try {
    var WebView = Java.use('android.webkit.WebView');
    var CookieManager = Java.use('android.webkit.CookieManager');
    var Handler = Java.use('android.os.Handler');
    var Looper = Java.use('android.os.Looper');
    var Runnable = Java.use('java.lang.Runnable');

    function dumpWebStorage(webview, targetUrl) {
      try {
        var script = [
          '(function(){',
          '  try {',
          '    var out = {',
          '      href: location.href,',
          '      origin: location.origin,',
          '      pathname: location.pathname,',
          '      search: location.search,',
          '      hash: location.hash,',
          '      title: document.title,',
          '      localStorage: {},',
          '      sessionStorage: {}',
          '    };',
          '    for (var i=0;i<localStorage.length;i++){',
          '      var k=localStorage.key(i); out.localStorage[k]=localStorage.getItem(k);',
          '    }',
          '    for (var j=0;j<sessionStorage.length;j++){',
          '      var s=sessionStorage.key(j); out.sessionStorage[s]=sessionStorage.getItem(s);',
          '    }',
          "    return JSON.stringify(out).slice(0, 12000);",
          '  } catch (e) { return "JS_DUMP_ERROR:"+e; }',
          '})();',
        ].join('');

        webview.evaluateJavascript(script, null);
        log('[WebViewDump] evaluateJavascript requested for ' + targetUrl);
      } catch (e) {
        log('[-] dumpWebStorage failed: ' + e);
      }
    }

    var loadUrl1 = WebView.loadUrl.overload('java.lang.String');
    loadUrl1.implementation = function (url) {
      var ret = loadUrl1.call(this, url);
      var u = safeToString(url);
      if (u.indexOf('m.woodongs.com') >= 0) {
        log('[WebView.loadUrl] ' + u);
        try {
          var cm = CookieManager.getInstance();
          var cookie = cm.getCookie(url);
          if (cookie) {
            log('[WebView.cookie] ' + preview(cookie));
          } else {
            log('[WebView.cookie] <empty>');
          }
        } catch (e) {
          log('[-] getCookie failed: ' + e);
        }

        try {
          var webview = this;
          var target = u;
          var handler = Handler.$new(Looper.getMainLooper());
          var task = Runnable.$new({
            run: function () {
              dumpWebStorage(webview, target);
            },
          });
          handler.postDelayed(task, 1200);
        } catch (e) {
          log('[-] postDelayed dump failed: ' + e);
        }
      }
      return ret;
    };

    var loadUrl2 = WebView.loadUrl.overload('java.lang.String', 'java.util.Map');
    loadUrl2.implementation = function (url, headers) {
      var ret = loadUrl2.call(this, url, headers);
      var u = safeToString(url);
      if (u.indexOf('m.woodongs.com') >= 0) {
        log('[WebView.loadUrl+headers] ' + u + ' headers=' + preview(safeToString(headers)));
      }
      return ret;
    };

    log('[+] WebView loadUrl/storage dump hook active');
  } catch (e) {
    log('[-] WebView dump hook failed: ' + e);
  }

  // 타깃 클래스 메서드 후킹
  var targets = [
    'S5.d',
    'S5.m',
    'K5.c$a',
    'L5.b',
    'E5.n',
    'G5.b',
    'F5.d$b',
  ];

  function hookMethod(Clazz, className, methodName) {
    try {
      var overloads = Clazz[methodName].overloads;
      for (var i = 0; i < overloads.length; i++) {
        (function (ov, idx) {
          ov.implementation = function () {
            var args = [];
            var interesting = false;

            for (var a = 0; a < arguments.length; a++) {
              var txt = argToRichText(arguments[a]);
              args.push('arg' + a + '=' + preview(txt));
              if (looksInteresting(txt)) {
                interesting = true;
              }
            }

            var ret = ov.apply(this, arguments);
            var retText = argToRichText(ret);
            if (looksInteresting(retText)) {
              interesting = true;
            }

            if (interesting) {
              logEvent('TARGET_HOOK', [
                'class=' + className,
                'method=' + methodName,
                'overload=' + idx,
                'ret=' + preview(retText),
              ].concat(args));
            }

            return ret;
          };
        })(overloads[i], i);
      }
      log('[+] hooked ' + className + '.' + methodName + ' (' + overloads.length + ')');
    } catch (e) {
      log('[-] hook failed ' + className + '.' + methodName + ': ' + e);
    }
  }

  function hookClass(className) {
    try {
      var Clazz = Java.use(className);
      var methods = Clazz.class.getDeclaredMethods();
      var seen = {};
      for (var i = 0; i < methods.length; i++) {
        var m = methods[i].getName();
        if (seen[m]) {
          continue;
        }
        seen[m] = true;
        if (Clazz[m] && Clazz[m].overloads) {
          hookMethod(Clazz, className, m);
        }
      }
    } catch (e) {
      log('[-] class hook failed ' + className + ': ' + e);
    }
  }

  for (var t = 0; t < targets.length; t++) {
    hookClass(targets[t]);
  }

  log('[+] gs25-msgapi-target-hook ready');
});
