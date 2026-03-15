/*
 * GS25 msg-api 분석용 Frida 스크립트
 *
 * 목적:
 * 1) SSL 우회 유지
 * 2) msg-api 호출 경로 탐지(URL/URLConnection)
 * 3) 암복호/Cipher 및 Base64 전후 데이터 관찰
 */

Java.perform(function () {
  var MAX_PREVIEW = 240;
  var LOG_LIMIT = 3000;
  var logCount = 0;

  function log(msg) {
    if (logCount >= LOG_LIMIT) {
      return;
    }
    logCount += 1;
    console.log(msg);
  }

  function safeToString(obj) {
    try {
      return obj ? obj.toString() : 'null';
    } catch (e) {
      return '<toString-error:' + e + '>';
    }
  }

  function bytesToUtf8(bytes) {
    if (!bytes) {
      return '';
    }
    try {
      var JString = Java.use('java.lang.String');
      return JString.$new(bytes, 'UTF-8').toString();
    } catch (e) {
      return '';
    }
  }

  function previewText(s) {
    if (!s) {
      return '';
    }
    var normalized = s.replace(/\s+/g, ' ').trim();
    if (normalized.length <= MAX_PREVIEW) {
      return normalized;
    }
    return normalized.slice(0, MAX_PREVIEW) + '...';
  }

  function looksInteresting(s) {
    if (!s) {
      return false;
    }
    var l = s.toLowerCase();
    return (
      l.indexOf('msg-api') >= 0 ||
      l.indexOf('stock') >= 0 ||
      l.indexOf('inventory') >= 0 ||
      l.indexOf('goods') >= 0 ||
      l.indexOf('product') >= 0 ||
      l.indexOf('store') >= 0 ||
      l.indexOf('barcode') >= 0 ||
      l.indexOf('woodongs') >= 0 ||
      l.indexOf('gsshop') >= 0 ||
      l.indexOf('{') >= 0 ||
      l.indexOf('"d"') >= 0
    );
  }

  function getStackText() {
    try {
      var Thread = Java.use('java.lang.Thread');
      var frames = Thread.currentThread().getStackTrace();
      var out = [];
      for (var i = 0; i < frames.length; i++) {
        out.push(frames[i].toString());
      }
      return out.join('\n');
    } catch (e) {
      return '';
    }
  }

  function stackFromApp(stack) {
    if (!stack) {
      return false;
    }
    return (
      stack.indexOf('com.gsr') >= 0 ||
      stack.indexOf('woodongs') >= 0 ||
      stack.indexOf('gsshop') >= 0 ||
      stack.indexOf('msg-api') >= 0
    );
  }

  function logBlock(title, body) {
    log('\n=== ' + title + ' ===\n' + body + '\n=== /' + title + ' ===');
  }

  log('[+] gs25-msgapi-probe loaded');

  // SSL 우회
  try {
    var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
    var SSLContext = Java.use('javax.net.ssl.SSLContext');

    var TrustManager = Java.registerClass({
      name: 'com.codex.gs25.TrustAllManager',
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
    log('[+] SSLContext.init hook active');
  } catch (e) {
    log('[-] SSL bypass hook failed: ' + e);
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
      log('[TLS] verifyChain bypass host=' + host);
      return untrustedChain;
    };
  } catch (e) {
    log('[-] TrustManagerImpl hook failed: ' + e);
  }

  // 클래스 스캔
  try {
    var matched = [];
    Java.enumerateLoadedClasses({
      onMatch: function (name) {
        var l = name.toLowerCase();
        if (
          l.indexOf('com.gsr') >= 0 &&
          (l.indexOf('crypto') >= 0 ||
            l.indexOf('encrypt') >= 0 ||
            l.indexOf('decrypt') >= 0 ||
            l.indexOf('network') >= 0 ||
            l.indexOf('http') >= 0 ||
            l.indexOf('msg') >= 0)
        ) {
          matched.push(name);
        }
      },
      onComplete: function () {
        matched.sort();
        logBlock('CLASS_SCAN', matched.slice(0, 120).join('\n'));
      },
    });
  } catch (e) {
    log('[-] class scan failed: ' + e);
  }

  // URL/URLConnection 관찰
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

    var URLConnection = Java.use('java.net.URLConnection');
    var getOutputStream = URLConnection.getOutputStream.overload();
    getOutputStream.implementation = function () {
      var u = safeToString(this.getURL());
      if (looksInteresting(u)) {
        log('[URLConnection.getOutputStream] ' + u + ' cls=' + this.getClass().getName());
      }
      return getOutputStream.call(this);
    };

    var getInputStream = URLConnection.getInputStream.overload();
    getInputStream.implementation = function () {
      var u = safeToString(this.getURL());
      if (looksInteresting(u)) {
        log('[URLConnection.getInputStream] ' + u + ' cls=' + this.getClass().getName());
      }
      return getInputStream.call(this);
    };
  } catch (e) {
    log('[-] URLConnection hook failed: ' + e);
  }

  // Base64 관찰
  try {
    var Base64 = Java.use('android.util.Base64');
    var b64Decode = Base64.decode.overload('java.lang.String', 'int');
    b64Decode.implementation = function (src, flags) {
      var out = b64Decode.call(this, src, flags);
      var stack = getStackText();
      if (stackFromApp(stack)) {
        var inText = safeToString(src);
        var outText = bytesToUtf8(out);
        if (looksInteresting(inText) || looksInteresting(outText)) {
          logBlock('BASE64_DECODE',
            'in=' + previewText(inText) + '\n' +
            'out=' + previewText(outText) + '\n' +
            'stack=' + previewText(stack));
        }
      }
      return out;
    };

    var b64Encode = Base64.encodeToString.overload('[B', 'int');
    b64Encode.implementation = function (input, flags) {
      var ret = b64Encode.call(this, input, flags);
      var stack = getStackText();
      if (stackFromApp(stack)) {
        var inText = bytesToUtf8(input);
        if (looksInteresting(inText) || looksInteresting(ret)) {
          logBlock('BASE64_ENCODE',
            'in=' + previewText(inText) + '\n' +
            'out=' + previewText(ret) + '\n' +
            'stack=' + previewText(stack));
        }
      }
      return ret;
    };
  } catch (e) {
    log('[-] Base64 hook failed: ' + e);
  }

  // Cipher 관찰
  try {
    var Cipher = Java.use('javax.crypto.Cipher');
    var modeMap = {};

    var cipherInit = Cipher.init.overload('int', 'java.security.Key');
    cipherInit.implementation = function (mode, key) {
      modeMap[this.hashCode()] = mode;
      return cipherInit.call(this, mode, key);
    };

    var doFinal1 = Cipher.doFinal.overload('[B');
    doFinal1.implementation = function (input) {
      var out = doFinal1.call(this, input);
      var stack = getStackText();
      if (stackFromApp(stack)) {
        var inText = bytesToUtf8(input);
        var outText = bytesToUtf8(out);
        if (looksInteresting(inText) || looksInteresting(outText)) {
          var mode = modeMap[this.hashCode()];
          var algo = safeToString(this.getAlgorithm());
          logBlock('CIPHER_DO_FINAL',
            'algo=' + algo + ' mode=' + mode + '\n' +
            'in=' + previewText(inText) + '\n' +
            'out=' + previewText(outText) + '\n' +
            'stack=' + previewText(stack));
        }
      }
      return out;
    };

    var doFinal2 = Cipher.doFinal.overload('[B', 'int', 'int');
    doFinal2.implementation = function (input, offset, len) {
      var out = doFinal2.call(this, input, offset, len);
      var stack = getStackText();
      if (stackFromApp(stack)) {
        var inText = bytesToUtf8(input);
        var outText = bytesToUtf8(out);
        if (looksInteresting(inText) || looksInteresting(outText)) {
          var mode = modeMap[this.hashCode()];
          var algo = safeToString(this.getAlgorithm());
          logBlock('CIPHER_DO_FINAL_SLICE',
            'algo=' + algo + ' mode=' + mode + ' offset=' + offset + ' len=' + len + '\n' +
            'in=' + previewText(inText) + '\n' +
            'out=' + previewText(outText) + '\n' +
            'stack=' + previewText(stack));
        }
      }
      return out;
    };

    log('[+] Cipher hook active');
  } catch (e) {
    log('[-] Cipher hook failed: ' + e);
  }
});
