/*
 * 세븐일레븐 SignEnc/XecureCrypto 암호화 경계 후킹
 *
 * 목적:
 * - SignEnc JNI(GetEncData/MakePinBlock) 입력/출력을 캡처
 * - XecureCrypto RSA 계열 함수 호출 여부를 추적
 * - 재고 API(암호화 payload) 재현 단서를 확보
 */

'use strict';

(function () {
  var MAX_DUMP = 512;
  var LOG_LIMIT = 4000;
  var logCount = 0;
  var getEncDataHookInstalled = false;
  var makePinBlockHookInstalled = false;
  var xecureHooksInstalled = false;

  function now() {
    return Date.now();
  }

  function emit(type, payload) {
    if (logCount >= LOG_LIMIT) {
      return;
    }
    logCount += 1;

    try {
      console.log('[SE_SIGNENC] ' + JSON.stringify({ t: type, ts: now(), payload: payload }));
    } catch (e) {
      console.log('[SE_SIGNENC] {"t":"error","ts":' + now() + ',"payload":{"msg":"emit_failed"}}');
    }
  }

  function toHex(byteArray) {
    if (!byteArray) {
      return '';
    }

    var u8 = new Uint8Array(byteArray);
    var out = '';
    for (var i = 0; i < u8.length; i++) {
      var h = u8[i].toString(16);
      out += h.length === 1 ? '0' + h : h;
    }
    return out;
  }

  function readJbyteArray(env, jarr, maxLen) {
    if (!env || !jarr || jarr.isNull()) {
      return null;
    }

    try {
      var len = env.getArrayLength(jarr);
      var isCopy = Memory.alloc(8);
      Memory.writeU8(isCopy, 0);
      var ptr = env.getByteArrayElements(jarr, isCopy);
      if (!ptr || ptr.isNull()) {
        return { len: len, hex: '' };
      }

      var n = len;
      if (n > maxLen) {
        n = maxLen;
      }
      var raw = Memory.readByteArray(ptr, n);
      var hex = toHex(raw);

      // JNI_ABORT(2): native 쪽 변경사항을 Java 배열에 반영하지 않음
      env.releaseByteArrayElements(jarr, ptr, 2);
      return {
        len: len,
        dumpLen: n,
        hex: hex,
      };
    } catch (e) {
      return {
        error: String(e),
      };
    }
  }

  function readJstring(env, jstr) {
    if (!env || !jstr || jstr.isNull()) {
      return '';
    }

    try {
      return env.stringFromJni(jstr);
    } catch (e) {
      return '';
    }
  }

  function getEnvSafe() {
    try {
      if (Java.vm && typeof Java.vm.tryGetEnv === 'function') {
        return Java.vm.tryGetEnv();
      }
      if (Java.vm && typeof Java.vm.getEnv === 'function') {
        return Java.vm.getEnv();
      }
    } catch (e) {
      return null;
    }

    return null;
  }

  function resolveExport(moduleName, exportName) {
    try {
      if (typeof Module.findExportByName === 'function') {
        return Module.findExportByName(moduleName, exportName);
      }
    } catch (e) {
      // ignore
    }

    try {
      if (typeof Module.getExportByName === 'function') {
        return Module.getExportByName(moduleName, exportName);
      }
    } catch (e) {
      return null;
    }

    return null;
  }

  function hookSignEncGetEncData() {
    if (getEncDataHookInstalled) {
      return;
    }

    var sym = resolveExport('libSignEnc.so', 'Java_kr_co_nicevan_signenc_SignEnc_GetEncData');
    if (!sym) {
      return;
    }

    Interceptor.attach(sym, {
      onEnter: function (args) {
        this.env = getEnvSafe();
        this.inArr = args[2];
        this.outArr = args[3];

        emit('signenc_getencdata_enter', {
          in: readJbyteArray(this.env, this.inArr, MAX_DUMP),
          out_before: readJbyteArray(this.env, this.outArr, 128),
        });
      },
      onLeave: function (retval) {
        emit('signenc_getencdata_leave', {
          retval: retval.toInt32(),
          out_after: readJbyteArray(this.env, this.outArr, MAX_DUMP),
        });
      },
    });

    emit('ready', { hook: 'GetEncData', address: sym.toString() });
    getEncDataHookInstalled = true;
  }

  function hookSignEncMakePinBlock() {
    if (makePinBlockHookInstalled) {
      return;
    }

    var sym = resolveExport('libSignEnc.so', 'Java_kr_co_nicevan_signenc_SignEnc_MakePinBlock');
    if (!sym) {
      return;
    }

    Interceptor.attach(sym, {
      onEnter: function (args) {
        this.env = getEnvSafe();
        this.pan = args[2];
        this.pin = args[3];
        this.outArr = args[4];

        emit('signenc_makepinblock_enter', {
          pan: readJstring(this.env, this.pan),
          pin: readJstring(this.env, this.pin),
          out_before: readJbyteArray(this.env, this.outArr, 128),
        });
      },
      onLeave: function (retval) {
        emit('signenc_makepinblock_leave', {
          retval: retval.toInt32(),
          out_after: readJbyteArray(this.env, this.outArr, 128),
        });
      },
    });

    emit('ready', { hook: 'MakePinBlock', address: sym.toString() });
    makePinBlockHookInstalled = true;
  }

  function hookXecureCrypto() {
    if (xecureHooksInstalled) {
      return;
    }

    var installed = 0;
    var candidates = [
      { name: 'SF_PKEY_Encrypt', group: 'rsa' },
      { name: 'SF_PKEY_Decrypt', group: 'rsa' },
      { name: 'SF_PKCS1_V15_Encrypt', group: 'rsa' },
      { name: 'SF_PKCS1_OAEP_Encrypt', group: 'rsa' },
      { name: 'SF_PKCS1_OAEP_Decrypt', group: 'rsa' },
      { name: 'SF_RSA_PublicKeyExp', group: 'rsa' },
      { name: 'SF_RSA_PrivateKeyExp', group: 'rsa' },
      { name: 'SF_RAND_GetRandom', group: 'rand' },
      { name: 'SF_GetRandom', group: 'rand' },
      { name: 'SF_Hash', group: 'hash' },
      { name: 'SF_SHA1', group: 'hash' },
      { name: 'SF_Cipher_Encrypt', group: 'cipher' },
    ];

    candidates.forEach(function (item) {
      var name = item.name;
      var group = item.group;
      var sym = resolveExport('libXecureCrypto.so', name);
      if (!sym) {
        return;
      }

      Interceptor.attach(sym, {
        onEnter: function (args) {
          emit('xecure_enter', {
            fn: name,
            group: group,
            a0: args[0].toString(),
            a1: args[1].toString(),
            a2: args[2].toString(),
            a3: args[3].toString(),
          });
        },
        onLeave: function (retval) {
          emit('xecure_leave', {
            fn: name,
            group: group,
            retval: retval.toInt32(),
          });
        },
      });

      emit('ready', { hook: name, group: group, address: sym.toString() });
      installed += 1;
    });

    if (installed > 0) {
      xecureHooksInstalled = true;
    }
  }

  function tryInstallHooks() {
    hookSignEncGetEncData();
    hookSignEncMakePinBlock();
    hookXecureCrypto();
  }

  function hookDlopenForLateLoad() {
    var dlopen = resolveExport(null, 'dlopen');
    var androidDlopenExt = resolveExport(null, 'android_dlopen_ext');

    function onLoad(path) {
      var name = String(path || '');
      if (name.indexOf('libSignEnc.so') >= 0 || name.indexOf('libXecureCrypto.so') >= 0) {
        setTimeout(function () {
          tryInstallHooks();
        }, 50);
      }
    }

    if (dlopen) {
      Interceptor.attach(dlopen, {
        onEnter: function (args) {
          this.path = args[0].isNull() ? '' : Memory.readUtf8String(args[0]);
        },
        onLeave: function () {
          onLoad(this.path);
        },
      });
    }

    if (androidDlopenExt) {
      Interceptor.attach(androidDlopenExt, {
        onEnter: function (args) {
          this.path = args[0].isNull() ? '' : Memory.readUtf8String(args[0]);
        },
        onLeave: function () {
          onLoad(this.path);
        },
      });
    }

    emit('ready', {
      hook: 'dlopen_watch',
      dlopen: !!dlopen,
      android_dlopen_ext: !!androidDlopenExt,
    });
  }

  function main() {
    emit('init', { script: 'seveneleven-signenc-hook', maxDump: MAX_DUMP });
    hookDlopenForLateLoad();
    tryInstallHooks();

    if (!getEncDataHookInstalled || !makePinBlockHookInstalled) {
      emit('warn', { hook: 'SignEnc', msg: 'waiting_for_module_load' });
    }
    if (!xecureHooksInstalled) {
      emit('warn', { hook: 'XecureCrypto', msg: 'waiting_for_module_load' });
    }
  }

  if (Java.available) {
    Java.perform(main);
  } else {
    emit('error', { msg: 'java_not_available' });
  }
})();
