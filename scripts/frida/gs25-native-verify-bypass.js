/*
 * GS25 네이티브 TLS 검증 우회
 * - BoringSSL/OpenSSL 계열 verify 경로를 직접 후킹
 * - 실패 허용 방식으로 동작
 */

(function () {
  const logs = (msg) => {
    try {
      console.log('[NATIVE_VERIFY] ' + msg);
    } catch (_) {}
  };

  function getExport(mod, name) {
    try {
      if (typeof Module.getExportByName === 'function') {
        return Module.getExportByName(mod, name);
      }
    } catch (_) {}
    try {
      if (typeof Module.findExportByName === 'function') {
        return Module.findExportByName(mod, name);
      }
    } catch (_) {}
    return null;
  }

  function findExportAnywhere(name) {
    const mods = Process.enumerateModules();
    for (const m of mods) {
      const ptr = getExport(m.name, name);
      if (ptr) return { ptr, moduleName: m.name };
    }
    return null;
  }

  function hookSslSetCustomVerify() {
    let hit = findExportAnywhere('SSL_set_custom_verify');
    if (!hit) {
      hit = findExportAnywhere('SSL_CTX_set_custom_verify');
    }
    if (!hit) {
      logs('SSL_set_custom_verify/SSL_CTX_set_custom_verify not found');
      return;
    }
    const addr = hit.ptr;

    const callbacks = new Map();

    Interceptor.attach(addr, {
      onEnter(args) {
        const sslPtr = args[0];
        const origCb = args[2];
        if (origCb.isNull()) {
          return;
        }
        if (callbacks.has(origCb.toString())) {
          args[2] = callbacks.get(origCb.toString());
          return;
        }

        // BoringSSL custom verify callback 관례:
        // int cb(SSL* ssl, uint8_t* out_alert)
        // 성공값 0(ssl_verify_ok) 반환
        const bypassCb = new NativeCallback(function (_ssl, _outAlert) {
          return 0;
        }, 'int', ['pointer', 'pointer']);

        callbacks.set(origCb.toString(), bypassCb);
        args[2] = bypassCb;
        logs('SSL_set_custom_verify callback replaced ssl=' + sslPtr + ' cb=' + origCb);
      },
    });

    logs('hooked custom_verify @ ' + addr + ' module=' + hit.moduleName);
  }

  function hookSslGetVerifyResult() {
    const hit = findExportAnywhere('SSL_get_verify_result');
    if (!hit) {
      logs('SSL_get_verify_result not found in any module');
      return;
    }
    const addr = hit.ptr;

    Interceptor.replace(
      addr,
      new NativeCallback(function (_ssl) {
        // X509_V_OK = 0
        return 0;
      }, 'long', ['pointer']),
    );

    logs('replaced SSL_get_verify_result @ ' + addr + ' module=' + hit.moduleName);
  }

  function hookX509VerifyCert() {
    const hit = findExportAnywhere('X509_verify_cert');
    if (!hit) {
      logs('X509_verify_cert not found in any module');
      return;
    }
    const addr = hit.ptr;

    Interceptor.replace(
      addr,
      new NativeCallback(function (_ctx) {
        // OpenSSL 계열: 1 == success
        return 1;
      }, 'int', ['pointer']),
    );

    logs('replaced X509_verify_cert @ ' + addr + ' module=' + hit.moduleName);
  }

  setImmediate(function () {
    try {
      hookSslSetCustomVerify();
    } catch (e) {
      logs('hookSslSetCustomVerify error: ' + e);
    }

    try {
      hookSslGetVerifyResult();
    } catch (e) {
      logs('hookSslGetVerifyResult error: ' + e);
    }

    try {
      hookX509VerifyCert();
    } catch (e) {
      logs('hookX509VerifyCert error: ' + e);
    }

    logs('setup_complete');
  });
})();
