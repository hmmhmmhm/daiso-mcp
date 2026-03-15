/*
 * GS25 Frida-only Pinning Deep Audit
 *
 * 목적:
 * - TrustManagerImpl.verifyChain 실제 오버로드를 동적으로 전부 후킹
 * - Conscrypt/OpenSSL 소켓 계열의 startHandshake/verifyCertificateChain 호출 감시
 * - b2c/woodongs/tms31 네트워크 단서(URL/Socket) 수집
 */

Java.perform(function () {
  var LOG_LIMIT = 9000;
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

  function hookAllOverloads(className, methodName, implFactory) {
    try {
      var C = Java.use(className);
      if (!C[methodName] || !C[methodName].overloads) {
        log('[-] ' + className + '.' + methodName + ' not found');
        return 0;
      }
      var ovs = C[methodName].overloads;
      for (var i = 0; i < ovs.length; i++) {
        (function (ov, idx) {
          ov.implementation = implFactory(ov, idx);
        })(ovs[i], i);
      }
      log('[+] hook ' + className + '.' + methodName + ' overloads=' + ovs.length);
      return ovs.length;
    } catch (e) {
      log('[-] hook fail ' + className + '.' + methodName + ': ' + e);
      return 0;
    }
  }

  function logOverloadSignatures(className, methodName) {
    try {
      var C = Java.use(className);
      if (!C[methodName] || !C[methodName].overloads) return;
      var ovs = C[methodName].overloads;
      for (var i = 0; i < ovs.length; i++) {
        var ov = ovs[i];
        var args = [];
        for (var j = 0; j < ov.argumentTypes.length; j++) {
          args.push(ov.argumentTypes[j].className);
        }
        log('[SIG] ' + className + '.' + methodName + ' #' + i + '(' + args.join(', ') + ')');
      }
    } catch (e) {
      log('[-] signature read fail ' + className + '.' + methodName + ': ' + e);
    }
  }

  function looksInterestingHost(host) {
    if (!host) return false;
    var l = ('' + host).toLowerCase();
    return (
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c-') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('gsretail') >= 0
    );
  }

  function looksInterestingUrl(url) {
    if (!url) return false;
    var l = ('' + url).toLowerCase();
    return (
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c-') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('msg-api') >= 0
    );
  }

  // 1) SSLContext 전역 trust manager 대체
  try {
    var X509TM = Java.use('javax.net.ssl.X509TrustManager');
    var SSLContext = Java.use('javax.net.ssl.SSLContext');
    var TrustAll = Java.registerClass({
      name: 'com.codex.gs25.FridaTrustAllDeep',
      implements: [X509TM],
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
      log('[PINNING_DEEP] SSLContext.init intercepted');
      return init.call(this, km, trustManagers, sr);
    };
    log('[+] SSLContext.init hook active');
  } catch (e) {
    log('[-] SSLContext hook failed: ' + e);
  }

  // 2) TrustManagerImpl.verifyChain 동적 후킹
  logOverloadSignatures('com.android.org.conscrypt.TrustManagerImpl', 'verifyChain');
  hookAllOverloads('com.android.org.conscrypt.TrustManagerImpl', 'verifyChain', function (ov, idx) {
    return function () {
      try {
        var host = arguments.length >= 3 ? safe(arguments[2]) : '';
        if (looksInterestingHost(host) || host.length > 0) {
          log('[PINNING_DEEP] TMI.verifyChain ov=' + idx + ' host=' + host);
        }
      } catch (e) {}
      // 가능한 원본 체인을 그대로 반환
      if (arguments.length > 0) {
        return arguments[0];
      }
      return ov.apply(this, arguments);
    };
  });

  // 3) Conscrypt / OpenSSL 소켓 계열
  hookAllOverloads(
    'com.android.org.conscrypt.ConscryptEngineSocket',
    'startHandshake',
    function (ov, idx) {
      return function () {
        log('[PINNING_DEEP] ConscryptEngineSocket.startHandshake ov=' + idx);
        return ov.apply(this, arguments);
      };
    },
  );

  hookAllOverloads(
    'com.android.org.conscrypt.ConscryptFileDescriptorSocket',
    'startHandshake',
    function (ov, idx) {
      return function () {
        log('[PINNING_DEEP] ConscryptFDSocket.startHandshake ov=' + idx);
        return ov.apply(this, arguments);
      };
    },
  );

  hookAllOverloads(
    'com.android.org.conscrypt.OpenSSLSocketImpl',
    'startHandshake',
    function (ov, idx) {
      return function () {
        log('[PINNING_DEEP] OpenSSLSocketImpl.startHandshake ov=' + idx);
        return ov.apply(this, arguments);
      };
    },
  );

  hookAllOverloads(
    'com.android.org.conscrypt.ActiveSession',
    'onPeerCertificateAvailable',
    function (ov, idx) {
      return function () {
        log('[PINNING_DEEP] ActiveSession.onPeerCertificateAvailable ov=' + idx);
        return ov.apply(this, arguments);
      };
    },
  );

  // 4) SSL 예외 감시
  hookAllOverloads(
    'javax.net.ssl.SSLPeerUnverifiedException',
    '$init',
    function (ov, idx) {
      return function () {
        var msg = arguments.length > 0 ? safe(arguments[0]) : '';
        log('[PINNING_DEEP] SSLPeerUnverifiedException ov=' + idx + ' msg=' + msg);
        return ov.apply(this, arguments);
      };
    },
  );

  // 5) URL / Socket 관측
  hookAllOverloads('java.net.URL', '$init', function (ov, idx) {
    return function () {
      if (arguments.length > 0) {
        var u = safe(arguments[0]);
        if (looksInterestingUrl(u)) {
          log('[NET_DEEP] URL ov=' + idx + ' ' + u);
        }
      }
      return ov.apply(this, arguments);
    };
  });

  try {
    var Socket = Java.use('java.net.Socket');
    var ISOCK = Java.use('java.net.InetSocketAddress');
    var connect = Socket.connect.overload('java.net.SocketAddress', 'int');
    connect.implementation = function (endpoint, timeout) {
      try {
        var ep = Java.cast(endpoint, ISOCK);
        var host = ep.getHostString();
        var port = ep.getPort();
        if (looksInterestingHost(host) || port === 443) {
          log('[NET_DEEP] Socket.connect host=' + host + ' port=' + port + ' timeout=' + timeout);
        }
      } catch (e) {}
      return connect.call(this, endpoint, timeout);
    };
    log('[+] Socket.connect hook active');
  } catch (e) {
    log('[-] Socket.connect hook failed: ' + e);
  }

  // 6) Cronet 빌더
  hookAllOverloads('org.chromium.net.UrlRequest$Builder', 'setHttpMethod', function (ov, idx) {
    return function () {
      log('[NET_DEEP] Cronet.method ov=' + idx + ' ' + safe(arguments[0]));
      return ov.apply(this, arguments);
    };
  });
  hookAllOverloads('org.chromium.net.UrlRequest$Builder', 'addHeader', function (ov, idx) {
    return function () {
      var k = safe(arguments[0]).toLowerCase();
      if (k.indexOf('authorization') >= 0 || k.indexOf('x-') >= 0) {
        log('[NET_DEEP] Cronet.header ov=' + idx + ' ' + safe(arguments[0]) + '=' + safe(arguments[1]));
      }
      return ov.apply(this, arguments);
    };
  });

  log('[+] gs25-frida-only-pinning-deep-audit ready');
});
