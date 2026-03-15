/*
 * GS25 고급 SSL Pinning 우회 스크립트
 * - Conscrypt/TrustManager/OkHttp/WebView/TrustKit 계열 우회 포인트를 폭넓게 후킹
 * - 모든 후킹은 실패 허용으로 구성해 앱 크래시를 피함
 */

Java.perform(function () {
  console.log('[ADV_UNPIN] loaded');

  function safe(name, fn) {
    try {
      fn();
      console.log('[ADV_UNPIN] hook_ok ' + name);
    } catch (e) {
      console.log('[ADV_UNPIN] hook_fail ' + name + ' :: ' + e);
    }
  }

  safe('SSLContext+TrustManager', function () {
    const X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
    const SSLContext = Java.use('javax.net.ssl.SSLContext');

    const TrustAllManager = Java.registerClass({
      name: 'com.codex.AdvTrustAllManager',
      implements: [X509TrustManager],
      methods: {
        checkClientTrusted: function () {},
        checkServerTrusted: function () {},
        getAcceptedIssuers: function () {
          return [];
        },
      },
    });

    const managers = [TrustAllManager.$new()];
    const initOverload = SSLContext.init.overload(
      '[Ljavax.net.ssl.KeyManager;',
      '[Ljavax.net.ssl.TrustManager;',
      'java.security.SecureRandom',
    );

    initOverload.implementation = function (km, tm, sr) {
      return initOverload.call(this, km, managers, sr);
    };
  });

  safe('HttpsURLConnection HostnameVerifier', function () {
    const HttpsURLConnection = Java.use('javax.net.ssl.HttpsURLConnection');
    const HostnameVerifier = Java.use('javax.net.ssl.HostnameVerifier');

    const TrustAllHostnameVerifier = Java.registerClass({
      name: 'com.codex.AdvTrustAllHostnameVerifier',
      implements: [HostnameVerifier],
      methods: {
        verify: function () {
          return true;
        },
      },
    });

    HttpsURLConnection.setDefaultHostnameVerifier(TrustAllHostnameVerifier.$new());
  });

  safe('Conscrypt TrustManagerImpl.verifyChain', function () {
    const TMI = Java.use('com.android.org.conscrypt.TrustManagerImpl');
    TMI.verifyChain.implementation = function (untrustedChain) {
      return untrustedChain;
    };
  });

  safe('Conscrypt TrustManagerImpl.checkTrustedRecursive', function () {
    const TMI = Java.use('com.android.org.conscrypt.TrustManagerImpl');
    TMI.checkTrustedRecursive.implementation = function () {
      const ArrayList = Java.use('java.util.ArrayList');
      return ArrayList.$new();
    };
  });

  safe('Conscrypt CertPinManager', function () {
    const CPM = Java.use('com.android.org.conscrypt.CertPinManager');
    const methods = CPM.class.getDeclaredMethods();
    const seen = {};
    for (let i = 0; i < methods.length; i += 1) {
      const n = String(methods[i].getName());
      if (seen[n]) continue;
      seen[n] = true;
      const overloads = CPM[n].overloads;
      for (let j = 0; j < overloads.length; j += 1) {
        const ov = overloads[j];
        ov.implementation = function () {
          return;
        };
      }
    }
  });

  safe('OkHttp3 CertificatePinner.check', function () {
    const CP = Java.use('okhttp3.CertificatePinner');
    CP.check.overloads.forEach(function (ov) {
      ov.implementation = function () {
        return;
      };
    });
  });

  safe('OkHttp3 CertificatePinner.check$okhttp', function () {
    const CP = Java.use('okhttp3.CertificatePinner');
    if (CP['check$okhttp']) {
      CP['check$okhttp'].overloads.forEach(function (ov) {
        ov.implementation = function () {
          return;
        };
      });
    }
  });

  safe('OkHostnameVerifier.verify', function () {
    const OkHV = Java.use('okhttp3.internal.tls.OkHostnameVerifier');
    OkHV.verify.overloads.forEach(function (ov) {
      ov.implementation = function () {
        return true;
      };
    });
  });

  safe('WebViewClient.onReceivedSslError', function () {
    const WebViewClient = Java.use('android.webkit.WebViewClient');
    WebViewClient.onReceivedSslError.overload(
      'android.webkit.WebView',
      'android.webkit.SslErrorHandler',
      'android.net.http.SslError',
    ).implementation = function (view, handler, err) {
      handler.proceed();
    };
  });

  safe('TrustKit OkHostnameVerifier.verify', function () {
    const TKOkHV = Java.use('com.datatheorem.android.trustkit.pinning.OkHostnameVerifier');
    TKOkHV.verify.overloads.forEach(function (ov) {
      ov.implementation = function () {
        return true;
      };
    });
  });

  safe('TrustKit PinningTrustManager.checkServerTrusted', function () {
    const PTM = Java.use('com.datatheorem.android.trustkit.pinning.PinningTrustManager');
    PTM.checkServerTrusted.overloads.forEach(function (ov) {
      ov.implementation = function () {
        return;
      };
    });
  });

  safe('X509TrustManagerExtensions.checkServerTrusted', function () {
    const X509Ext = Java.use('android.net.http.X509TrustManagerExtensions');
    X509Ext.checkServerTrusted.overloads.forEach(function (ov) {
      ov.implementation = function () {
        const ArrayList = Java.use('java.util.ArrayList');
        return ArrayList.$new();
      };
    });
  });

  safe('Network Security Config host verifier', function () {
    const HV = Java.use('javax.net.ssl.HostnameVerifier');
    const HttpsURLConnection = Java.use('javax.net.ssl.HttpsURLConnection');
    const TrustAllHV = Java.registerClass({
      name: 'com.codex.AdvTrustAllHV2',
      implements: [HV],
      methods: {
        verify: function () {
          return true;
        },
      },
    });
    HttpsURLConnection.setDefaultHostnameVerifier(TrustAllHV.$new());
  });

  console.log('[ADV_UNPIN] setup_complete');
});
