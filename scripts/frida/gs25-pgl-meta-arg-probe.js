/*
 * GS25 libnms meta 엔트리 인자 배치 확인용 프로브
 */
/* global Process, Interceptor, console */

'use strict';

(function () {
  var seen = 0;
  var LIMIT = 80;

  function emit(e) {
    if (seen >= LIMIT) return;
    seen += 1;
    e.ts = Date.now();
    console.log('[GS25_PGL_META_ARG] ' + JSON.stringify(e));
  }

  function install() {
    var mod = Process.findModuleByName('libnms.so');
    if (!mod) return false;
    var meta = mod.base.add(0x39894);
    Interceptor.attach(meta, {
      onEnter: function (args) {
        var a0 = null;
        var a1 = null;
        var a2 = null;
        var a3 = null;
        try {
          a0 = args[0] ? args[0].toString() : null;
          a1 = args[1] ? args[1].toString() : null;
          a2 = args[2] ? args[2].toString() : null;
          a3 = args[3] ? args[3].toString() : null;
        } catch {
          // ignore
        }
        var i1 = null;
        var i2 = null;
        try {
          i1 = args[1].toInt32();
        } catch {
          i1 = null;
        }
        try {
          i2 = args[2].toInt32();
        } catch {
          i2 = null;
        }
        emit({ t: 'meta_enter', a0: a0, a1: a1, a2: a2, a3: a3, i1: i1, i2: i2 });
      },
    });
    emit({ t: 'hook_ok', base: mod.base.toString(), size: mod.size, off: '0x39894' });
    return true;
  }

  if (!install()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (install() || tries >= 200) {
        clearInterval(timer);
      }
    }, 100);
  }
})();
