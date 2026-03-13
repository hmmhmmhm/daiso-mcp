/*
 * GS25 code=301 helper(FUN_00128654) 간접 분기 대상 추적기
 *
 * 목적:
 * - FUN_00128654 내부의 FUN_0013d5b4(indirect jump) 첫 인자(함수 포인터)를 수집
 */
/* global Process, Interceptor, console, setInterval, clearInterval, ptr */

'use strict';

(function () {
  var LOG_LIMIT = 2000;
  var logCount = 0;
  var hooksInstalled = false;
  var libnms = null;
  var seq = 0;
  var active = Object.create(null); // tid -> { seq, startedAt }

  var OFF_META = 0x39894;
  var OFF_HELPER_301 = 0x28654;
  var OFF_INDIRECT = 0x3d5b4;

  function emit(e) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    if (e && typeof e === 'object' && e.ts === undefined) e.ts = Date.now();
    console.log('[GS25_PGL_301_INDIRECT] ' + JSON.stringify(e));
  }

  function tid(self) {
    try {
      if (self && typeof self.threadId === 'number') return self.threadId;
    } catch {
      // ignore
    }
    try {
      return Process.getCurrentThreadId();
    } catch {
      return -1;
    }
  }

  function offset(addr) {
    try {
      return '0x' + ptr(addr).sub(libnms.base).toString(16);
    } catch {
      return null;
    }
  }

  function install() {
    if (hooksInstalled) return true;
    libnms = Process.findModuleByName('libnms.so');
    if (!libnms) return false;

    var metaAddr = libnms.base.add(OFF_META);
    var helperAddr = libnms.base.add(OFF_HELPER_301);
    var indirectAddr = libnms.base.add(OFF_INDIRECT);

    Interceptor.attach(metaAddr, {
      onEnter: function (args) {
        var code = -1;
        try {
          code = args[2].toInt32();
        } catch {
          code = -1;
        }
        if (code !== 301) return;
        var t = tid(this);
        seq += 1;
        active[t] = { seq: seq, startedAt: Date.now() };
        emit({ t: 'meta301_enter', tid: t, seq: seq });
      },
      onLeave: function (retval) {
        var t = tid(this);
        var st = active[t];
        if (!st) return;
        emit({
          t: 'meta301_leave',
          tid: t,
          seq: st.seq,
          durMs: Date.now() - st.startedAt,
          ret: retval ? retval.toString() : null,
        });
        delete active[t];
      },
    });

    Interceptor.attach(helperAddr, {
      onEnter: function () {
        var t = tid(this);
        var st = active[t];
        if (!st) return;
        emit({ t: 'helper301_enter', tid: t, seq: st.seq });
      },
      onLeave: function (retval) {
        var t = tid(this);
        var st = active[t];
        if (!st) return;
        emit({ t: 'helper301_leave', tid: t, seq: st.seq, ret: retval ? retval.toString() : null });
      },
    });

    Interceptor.attach(indirectAddr, {
      onEnter: function (args) {
        var t = tid(this);
        var st = active[t];
        if (!st) return;
        var target = args[0];
        emit({
          t: 'indirect_call',
          tid: t,
          seq: st.seq,
          target: target ? target.toString() : null,
          targetOffset: target ? offset(target) : null,
          arg2: args[1] ? args[1].toString() : null,
        });
      },
    });

    hooksInstalled = true;
    emit({
      t: 'hook_ok',
      target: 'meta301+helper301+indirect',
      meta: metaAddr.toString(),
      helper: helperAddr.toString(),
      indirect: indirectAddr.toString(),
      moduleBase: libnms.base.toString(),
      moduleSize: libnms.size,
    });
    emit({ t: 'ready', name: 'gs25-pgl-meta-301-indirect-probe' });
    return true;
  }

  if (!install()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (install() || tries >= 120) {
        clearInterval(timer);
        if (!hooksInstalled) emit({ t: 'init_fail', reason: 'libnms.so not loaded in time' });
      }
    }, 250);
  }
})();
