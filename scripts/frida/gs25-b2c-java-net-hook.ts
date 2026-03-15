/*
 * GS25 b2c Java 네트워크 후킹 스크립트
 *
 * 목적:
 * - 앱 크래시 위험이 큰 네이티브 connect 훅 대신 Java/Cronet 계층에서 URL/헤더 단서 확보
 */

Java.perform(function () {
  var maxLog = 6000;
  var logCount = 0;

  function log(msg) {
    if (logCount >= maxLog) {
      return;
    }
    logCount += 1;
    console.log(msg);
  }

  function looksInteresting(s) {
    if (!s) {
      return false;
    }
    var l = s.toLowerCase();
    return (
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('b2c-') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('inventory') >= 0 ||
      l.indexOf('stock') >= 0
    );
  }

  // java.net.Socket 연결 추적
  try {
    var Socket = Java.use('java.net.Socket');
    var InetSocketAddress = Java.use('java.net.InetSocketAddress');
    var connectOverload = Socket.connect.overload('java.net.SocketAddress', 'int');
    connectOverload.implementation = function (endpoint, timeout) {
      try {
        var ep = Java.cast(endpoint, InetSocketAddress);
        var host = ep.getHostString();
        var port = ep.getPort();
        if (host && (host.indexOf('woodongs') >= 0 || port === 443)) {
          log('[Socket.connect] host=' + host + ' port=' + port + ' timeout=' + timeout);
        }
      } catch (e) {}
      return connectOverload.call(this, endpoint, timeout);
    };
    log('[+] java.net.Socket.connect hook active');
  } catch (e) {
    log('[-] Socket.connect hook failed: ' + e);
  }

  // HttpsURLConnection 추적
  try {
    var HttpsURLConnection = Java.use('javax.net.ssl.HttpsURLConnection');
    var connectFn = HttpsURLConnection.connect.overload();
    connectFn.implementation = function () {
      try {
        var url = this.getURL().toString();
        if (looksInteresting(url)) {
          log('[HttpsURLConnection.connect] ' + url);
        }
      } catch (e) {}
      return connectFn.call(this);
    };
    log('[+] HttpsURLConnection hook active');
  } catch (e) {
    log('[-] HttpsURLConnection hook failed: ' + e);
  }

  // okhttp Request.Builder URL/헤더 추적
  try {
    var ReqBuilder = Java.use('okhttp3.Request$Builder');
    var urlStr = ReqBuilder.url.overload('java.lang.String');
    urlStr.implementation = function (u) {
      if (looksInteresting(u)) {
        log('[okhttp.url] ' + u);
      }
      return urlStr.call(this, u);
    };

    var addHeader = ReqBuilder.addHeader.overload('java.lang.String', 'java.lang.String');
    addHeader.implementation = function (k, v) {
      if (k && (k.toLowerCase().indexOf('authorization') >= 0 || k.toLowerCase().indexOf('x-') >= 0)) {
        log('[okhttp.header] ' + k + '=' + v);
      }
      return addHeader.call(this, k, v);
    };
    log('[+] okhttp3.Request$Builder hook active');
  } catch (e) {
    log('[-] okhttp hook failed: ' + e);
  }

  // Cronet UrlRequest.Builder 추적
  try {
    var CronetBuilder = Java.use('org.chromium.net.UrlRequest$Builder');
    var setMethod = CronetBuilder.setHttpMethod.overload('java.lang.String');
    setMethod.implementation = function (m) {
      try {
        log('[cronet.method] ' + m);
      } catch (e) {}
      return setMethod.call(this, m);
    };

    var addHdr = CronetBuilder.addHeader.overload('java.lang.String', 'java.lang.String');
    addHdr.implementation = function (k, v) {
      try {
        if (k && (k.toLowerCase().indexOf('authorization') >= 0 || k.toLowerCase().indexOf('x-') >= 0)) {
          log('[cronet.header] ' + k + '=' + v);
        }
      } catch (e) {}
      return addHdr.call(this, k, v);
    };

    var build = CronetBuilder.build.overload();
    build.implementation = function () {
      try {
        log('[cronet.build] request build');
      } catch (e) {}
      return build.call(this);
    };
    log('[+] Cronet UrlRequest$Builder hook active');
  } catch (e) {
    log('[-] Cronet hook failed: ' + e);
  }

  log('[+] gs25-b2c-java-net-hook ready');
});
