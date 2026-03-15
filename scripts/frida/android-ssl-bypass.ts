/*
 * Android SSL Pinning 우회 스크립트 (GS25 실측용)
 * - Java 레이어의 대표 핀닝/검증 포인트를 우회
 * - 앱별 네이티브 핀닝은 별도 후킹이 필요할 수 있음
 */

Java.perform(function () {
  console.log('[+] SSL bypass script loaded');

  // 1) TrustManager: 모든 인증서를 신뢰
  try {
    var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
    var SSLContext = Java.use('javax.net.ssl.SSLContext');

    var TrustManager = Java.registerClass({
      name: 'com.codex.TrustAllManager',
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
    var SSLContext_init = SSLContext.init.overload(
      '[Ljavax.net.ssl.KeyManager;',
      '[Ljavax.net.ssl.TrustManager;',
      'java.security.SecureRandom',
    );

    SSLContext_init.implementation = function (keyManager, trustManager, secureRandom) {
      console.log('[+] SSLContext.init() hooked');
      SSLContext_init.call(this, keyManager, trustManagers, secureRandom);
    };
  } catch (e) {
    console.log('[-] SSLContext hook failed: ' + e);
  }

  // 2) okhttp3 CertificatePinner 우회
  try {
    var CertificatePinner = Java.use('okhttp3.CertificatePinner');

    CertificatePinner.check.overload('java.lang.String', 'java.util.List').implementation = function (
      hostname,
      peerCertificates,
    ) {
      console.log('[+] OkHttp CertificatePinner.check(host, list) bypass: ' + hostname);
      return;
    };

    CertificatePinner.check.overload('java.lang.String', 'java.security.cert.Certificate').implementation = function (
      hostname,
      cert,
    ) {
      console.log('[+] OkHttp CertificatePinner.check(host, cert) bypass: ' + hostname);
      return;
    };

    CertificatePinner.check.overload('java.lang.String', '[Ljava.security.cert.Certificate;').implementation = function (
      hostname,
      certs,
    ) {
      console.log('[+] OkHttp CertificatePinner.check(host, cert[]) bypass: ' + hostname);
      return;
    };
  } catch (e) {
    console.log('[-] OkHttp CertificatePinner hook failed: ' + e);
  }

  // 3) TrustManagerImpl(Android) 우회
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
      console.log('[+] TrustManagerImpl.verifyChain bypass: ' + host);
      return untrustedChain;
    };
  } catch (e) {
    console.log('[-] TrustManagerImpl hook failed: ' + e);
  }

  // 4) HostnameVerifier 우회
  try {
    var HttpsURLConnection = Java.use('javax.net.ssl.HttpsURLConnection');
    var HostnameVerifier = Java.use('javax.net.ssl.HostnameVerifier');

    var TrustHostnameVerifier = Java.registerClass({
      name: 'com.codex.TrustAllHostnameVerifier',
      implements: [HostnameVerifier],
      methods: {
        verify: function (hostname, session) {
          return true;
        },
      },
    });

    HttpsURLConnection.setDefaultHostnameVerifier(TrustHostnameVerifier.$new());
    console.log('[+] Default HostnameVerifier set to trust all');
  } catch (e) {
    console.log('[-] HostnameVerifier hook failed: ' + e);
  }

  console.log('[+] SSL bypass hook setup complete');
});
