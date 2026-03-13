/*
 * GS25 JNI RegisterNatives 매핑 수집 스크립트
 *
 * 목적:
 * - 앱 런타임에서 Java native 메서드 등록 테이블(class/name/signature/fnPtr)을 수집
 * - Ghidra의 FUN_* 주소와 실제 등록 지점을 연결
 */
/* global Java, Module, Interceptor, Process, ptr, console */

'use strict';

(function () {
  var LOG_LIMIT = 4000;
  var logCount = 0;
  var seen = Object.create(null);

  function emit(e) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    console.log('[GS25_JNI_NATIVE_MAP] ' + JSON.stringify(e));
  }

  function safeCString(p) {
    try {
      if (!p || p.isNull()) return '';
      return p.readCString();
    } catch {
      return '';
    }
  }

  function findRegisterNatives() {
    var candidates = [];
    try {
      var syms = Module.enumerateSymbolsSync('libart.so');
      for (var i = 0; i < syms.length; i += 1) {
        var n = syms[i].name || '';
        if (n.indexOf('RegisterNatives') >= 0) {
          candidates.push(syms[i]);
        }
      }
    } catch {
      return null;
    }
    if (candidates.length === 0) return null;
    candidates.sort(function (a, b) {
      function score(x) {
        var n = x.name || '';
        var s = 0;
        if (n.indexOf('CheckJNI') >= 0) s += 50;
        if (n.indexOf('JNI') >= 0) s -= 10;
        s += n.length;
        return s;
      }
      return score(a) - score(b);
    });
    return candidates[0];
  }

  function findRegisterNativesAnyModule() {
    var mods = Process.enumerateModules();
    for (var i = 0; i < mods.length; i += 1) {
      var m = mods[i];
      if (m.name.indexOf('libart') < 0) continue;
      try {
        var syms = Module.enumerateSymbolsSync(m.name);
        for (var j = 0; j < syms.length; j += 1) {
          var n = syms[j].name || '';
          if (n.indexOf('RegisterNatives') >= 0) {
            return syms[j];
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  function classNameOf(jclassPtr) {
    try {
      if (!Java.available) return '';
      var env = Java.vm.tryGetEnv();
      if (!env) return '';
      return env.getClassName(jclassPtr) || '';
    } catch {
      return '';
    }
  }

  function hook() {
    var sym = null;
    var regAddr = null;
    var source = '';
    try {
      if (Java.available) {
        var env = Java.vm.getEnv();
        var envPtr = env.handle;
        var fnTable = envPtr.readPointer();
        var idxRegisterNatives = 215; // JNINativeInterface.RegisterNatives index
        regAddr = fnTable.add(Process.pointerSize * idxRegisterNatives).readPointer();
        if (regAddr && !regAddr.isNull()) {
          source = 'jni_table_index_215';
        }
      }
    } catch {
      // fallback
    }

    if (!regAddr || regAddr.isNull()) {
      sym = findRegisterNatives() || findRegisterNativesAnyModule();
      if (sym && sym.address) {
        regAddr = sym.address;
        source = sym.name || 'symbol_fallback';
      }
    }

    if (!regAddr || regAddr.isNull()) {
      emit({ t: 'hook_fail', target: 'RegisterNatives' });
      return;
    }

    Interceptor.attach(regAddr, {
      onEnter: function (args) {
        var jclassPtr = args[1];
        var methods = args[2];
        var methodCount = args[3].toInt32();
        var cls = classNameOf(jclassPtr);
        var ptrSize = Process.pointerSize;
        var stride = ptrSize * 3;

        emit({
          t: 'register_natives_call',
          symbol: source,
          className: cls || null,
          count: methodCount,
        });

        for (var i = 0; i < methodCount; i += 1) {
          try {
            var base = methods.add(i * stride);
            var namePtr = base.readPointer();
            var sigPtr = base.add(ptrSize).readPointer();
            var fnPtr = base.add(ptrSize * 2).readPointer();

            var name = safeCString(namePtr);
            var sig = safeCString(sigPtr);
            var fnStr = fnPtr ? fnPtr.toString() : '';
            var moduleName = null;
            var moduleOffset = null;
            try {
              var mod = Process.findModuleByAddress(fnPtr);
              if (mod) {
                moduleName = mod.name || null;
                moduleOffset = ptr(fnPtr).sub(mod.base).toString();
              }
            } catch {
              // ignore
            }
            var key = (cls || '?') + '|' + name + '|' + sig + '|' + fnStr;
            if (seen[key]) continue;
            seen[key] = true;

            emit({
              t: 'register_native',
              className: cls || null,
              name: name || null,
              signature: sig || null,
              fnPtr: fnStr || null,
              moduleName: moduleName,
              moduleOffset: moduleOffset,
            });
          } catch {
            // ignore bad entry
          }
        }
      },
    });

    emit({
      t: 'hook_ok',
      target: 'RegisterNatives',
      symbol: source,
      address: regAddr.toString(),
    });
  }

  function collectNativeMethodsSnapshot() {
    try {
      var Modifier = Java.use('java.lang.reflect.Modifier');
      var classes = Java.enumerateLoadedClassesSync();
      var allow = /(com\.gsr|gstown|woodongs|com\.pgl|ssdk|ces)/i;
      var classCount = 0;
      for (var i = 0; i < classes.length; i += 1) {
        var name = classes[i];
        if (!allow.test(name)) continue;
        try {
          var Cls = Java.use(name);
          var jClass = Cls.class;
          var methods = jClass.getDeclaredMethods();
          var natives = [];
          for (var j = 0; j < methods.length; j += 1) {
            var m = methods[j];
            if (!Modifier.isNative(m.getModifiers())) continue;
            natives.push(String(m.toString()));
          }
          if (natives.length > 0) {
            classCount += 1;
            emit({
              t: 'native_methods_snapshot',
              className: name,
              nativeCount: natives.length,
              methods: natives,
            });
          }
        } catch {
          // ignore per-class failures
        }
      }
      emit({ t: 'native_methods_snapshot_done', classCount: classCount });
    } catch {
      emit({ t: 'native_methods_snapshot_fail' });
    }
  }

  hook();

  Java.perform(function () {
    emit({ t: 'ready', name: 'gs25-jni-registernatives-hook' });
  });
})();
