/*
 * GS25 Frida-only Pinning Audit
 *
 * 목적:
 * - 프록시 없이 앱 내부에서 pinning 관련 호출/실패 징후를 관찰
 * - Java 계층 네트워크 생성 지점(URL/Socket/Cronet) 단서를 함께 수집
 */

Java.perform(function () {
  var LOG_LIMIT = 6000;
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

  function looksInterestingUrl(u) {
    if (!u) return false;
    var l = ('' + u).toLowerCase();
    return (
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c-') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('msg-api') >= 0
    );
  }

  // 1) SSLContext 전역 trust manager 대체
  try {
    var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
    var SSLContext = Java.use('javax.net.ssl.SSLContext');
    var TrustAll = Java.registerClass({
      name: 'com.codex.gs25.FridaTrustAll',
      implements: [X509TrustManager],
      methods: {
        checkClientTrusted: function (chain, authType) {},
        checkServerTrusted: function (chain, authType) {},
        getAcceptedIssuers: function () {
          return [];
        },
      },
    });

    var trustManagers = [TrustAll.$new()];
    var init = SSLContext.init.overload(
      '[Ljavax.net.ssl.KeyManager;',
      '[Ljavax.net.ssl.TrustManager;',
      'java.security.SecureRandom',
    );
    init.implementation = function (km, tm, sr) {
      log('[PINNING_AUDIT] SSLContext.init intercepted');
      return init.call(this, km, trustManagers, sr);
    };
    log('[+] SSLContext.init hook active');
  } catch (e) {
    log('[-] SSLContext hook failed: ' + e);
  }

  // 2) Conscrypt verifyChain 호출 감시
  try {
    var TMI = Java.use('com.android.org.conscrypt.TrustManagerImpl');
    var verifyChain = TMI.verifyChain.overload(
      '[Ljava.security.cert.X509Certificate;',
      'java.util.Collection',
      'java.lang.String',
      'boolean',
      '[B',
      '[B',
    );
    verifyChain.implementation = function (
      untrustedChain,
      trustAnchorChain,
      host,
      clientAuth,
      ocspData,
      tlsSctData,
    ) {
      if (host) {
        log('[PINNING_AUDIT] TrustManagerImpl.verifyChain host=' + host);
      }
      return untrustedChain;
    };
    log('[+] TrustManagerImpl.verifyChain hook active');
  } catch (e) {
    log('[-] TrustManagerImpl hook failed: ' + e);
  }

  // 3) OkHttp CertificatePinner 체크 감시/우회
  try {
    var CP = Java.use('okhttp3.CertificatePinner');
    var ovs = CP.check.overloads;
    for (var i = 0; i < ovs.length; i++) {
      (function (ov, idx) {
        ov.implementation = function () {
          try {
            var host = arguments.length > 0 ? safe(arguments[0]) : '';
            log('[PINNING_AUDIT] CertificatePinner.check ov=' + idx + ' host=' + host);
          } catch (e) {}
          return; // bypass
        };
      })(ovs[i], i);
    }
    log('[+] okhttp3.CertificatePinner.check hook active (' + ovs.length + ')');
  } catch (e) {
    log('[-] CertificatePinner hook failed (okhttp 미사용 가능): ' + e);
  }

  // 4) SSL 예외 감시 (pinning 실패 징후)
  try {
    var SSLPeerUnverifiedException = Java.use('javax.net.ssl.SSLPeerUnverifiedException');
    var initEx = SSLPeerUnverifiedException.$init.overload('java.lang.String');
    initEx.implementation = function (msg) {
      log('[PINNING_AUDIT] SSLPeerUnverifiedException msg=' + safe(msg));
      return initEx.call(this, msg);
    };
    log('[+] SSLPeerUnverifiedException hook active');
  } catch (e) {
    log('[-] SSLPeerUnverifiedException hook failed: ' + e);
  }

  // 5) WebView SSL 오류 감시/진행
  try {
    var WVC = Java.use('android.webkit.WebViewClient');
    var onSsl = WVC.onReceivedSslError.overload(
      'android.webkit.WebView',
      'android.webkit.SslErrorHandler',
      'android.net.http.SslError',
    );
    onSsl.implementation = function (view, handler, error) {
      log('[PINNING_AUDIT] WebView.onReceivedSslError ' + safe(error));
      try {
        handler.proceed();
      } catch (e2) {}
      return;
    };
    log('[+] WebView onReceivedSslError hook active');
  } catch (e) {
    log('[-] WebView SSL hook failed: ' + e);
  }

  // 6) 네트워크 단서(URL/Socket/Cronet)
  try {
    var URL = Java.use('java.net.URL');
    var URLInit = URL.$init.overload('java.lang.String');
    URLInit.implementation = function (u) {
      var out = URLInit.call(this, u);
      var us = safe(u);
      if (looksInterestingUrl(us)) {
        log('[NET_AUDIT] URL ' + us);
      }
      return out;
    };
    log('[+] URL hook active');
  } catch (e) {
    log('[-] URL hook failed: ' + e);
  }

  try {
    var Socket = Java.use('java.net.Socket');
    var ISOCK = Java.use('java.net.InetSocketAddress');
    var connect = Socket.connect.overload('java.net.SocketAddress', 'int');
    connect.implementation = function (endpoint, timeout) {
      try {
        var ep = Java.cast(endpoint, ISOCK);
        var host = ep.getHostString();
        var port = ep.getPort();
        if (host && (host.indexOf('woodongs') >= 0 || host.indexOf('gsshop') >= 0 || port === 443)) {
          log('[NET_AUDIT] Socket.connect host=' + host + ' port=' + port + ' timeout=' + timeout);
        }
      } catch (e) {}
      return connect.call(this, endpoint, timeout);
    };
    log('[+] Socket.connect hook active');
  } catch (e) {
    log('[-] Socket.connect hook failed: ' + e);
  }

  try {
    var CBuilder = Java.use('org.chromium.net.UrlRequest$Builder');
    var setMethod = CBuilder.setHttpMethod.overload('java.lang.String');
    setMethod.implementation = function (m) {
      log('[NET_AUDIT] Cronet.method ' + safe(m));
      return setMethod.call(this, m);
    };
    var addHeader = CBuilder.addHeader.overload('java.lang.String', 'java.lang.String');
    addHeader.implementation = function (k, v) {
      var ks = safe(k).toLowerCase();
      if (ks.indexOf('authorization') >= 0 || ks.indexOf('x-') >= 0) {
        log('[NET_AUDIT] Cronet.header ' + safe(k) + '=' + safe(v));
      }
      return addHeader.call(this, k, v);
    };
    log('[+] Cronet builder hook active');
  } catch (e) {
    log('[-] Cronet hook failed: ' + e);
  }

  log('[+] gs25-frida-only-pinning-audit ready');
});
