/*
 * GS25 libnms.so meta 네이티브 분기 추적 스크립트
 *
 * 목적:
 * - com.pgl.ssdk.ces.a.meta -> libnms.so+0x39894 진입 시 code별 내부 helper 호출 경로 수집
 */
/* global Module, Interceptor, Process, ptr, console, setInterval, clearInterval */

'use strict';

(function () {
  var LOG_LIMIT = 6000;
  var logCount = 0;
  var ctxByTid = Object.create(null);
  var hooksInstalled = false;
  var globalSeq = 0;

  var TARGETS = [
    { name: 'meta_entry', offset: 0x39894, isMeta: true },
    { name: 'meta_dispatch', offset: 0x39a5c },
    { name: 'FUN_001177c8', offset: 0x177c8 },
    { name: 'FUN_0011809c', offset: 0x1809c },
    { name: 'FUN_0011843c', offset: 0x1843c },
    { name: 'FUN_001198fc', offset: 0x198fc },
    { name: 'FUN_00119f08', offset: 0x19f08 },
    { name: 'FUN_00128384', offset: 0x28384 },
    { name: 'FUN_001285c4', offset: 0x285c4 },
    { name: 'FUN_00128654', offset: 0x28654 },
    { name: 'FUN_00135680', offset: 0x35680 },
    { name: 'FUN_00138f88', offset: 0x38f88 },
    { name: 'FUN_0013d6c0', offset: 0x3d6c0 },
    { name: 'FUN_0013f224', offset: 0x3f224 },
  ];

  function emit(e) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    if (e && typeof e === 'object' && e.ts === undefined) {
      e.ts = Date.now();
    }
    console.log('[GS25_PGL_META_NATIVE] ' + JSON.stringify(e));
  }

  function p(v) {
    try {
      if (v === null || v === undefined) return '';
      return ptr(v).toString();
    } catch {
      return '';
    }
  }

  function getTid(self) {
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

  function hookAt(base, target) {
    var addr = base.add(target.offset);
    Interceptor.attach(addr, {
      onEnter: function (args) {
        var tid = getTid(this);
        var now = Date.now();
        this.__enterTs = now;
        if (target.isMeta) {
          var code = 0;
          try {
            code = args[2].toInt32();
          } catch {
            code = -1;
          }
          globalSeq += 1;
          var seq = globalSeq;
          ctxByTid[tid] = {
            code: code,
            seq: seq,
            ts: now,
          };
          this.__metaCtx = { tid: tid, seq: seq };
          emit({
            t: 'meta_enter',
            tid: tid,
            seq: seq,
            code: code,
            env: p(args[0]),
            clazz: p(args[1]),
            ctxObj: p(args[3]),
            obj: p(args[4]),
          });
          return;
        }

        var active = ctxByTid[tid];
        if (!active) return;
        this.__activeCode = active.code;
        this.__activeSeq = active.seq;
        this.__activeTid = tid;
        this.__helperName = target.name;
        this.__helperOffset = target.offset;
        emit({
          t: 'helper_enter',
          tid: tid,
          seq: active.seq,
          code: active.code,
          name: target.name,
          offset: '0x' + target.offset.toString(16),
          a0: p(args[0]),
          a1: p(args[1]),
          a2: p(args[2]),
          a3: p(args[3]),
        });
      },
      onLeave: function (retval) {
        var leaveTs = Date.now();
        var durMs = this.__enterTs ? leaveTs - this.__enterTs : -1;
        if (target.isMeta) {
          var tid = this.__metaCtx ? this.__metaCtx.tid : getTid(this);
          var seq = this.__metaCtx ? this.__metaCtx.seq : -1;
          var active = ctxByTid[tid];
          var code = active ? active.code : -1;
          emit({
            t: 'meta_leave',
            tid: tid,
            seq: seq,
            code: code,
            ret: p(retval),
            durMs: durMs,
          });
          delete ctxByTid[tid];
          return;
        }

        if (this.__activeTid === undefined) return;
        emit({
          t: 'helper_leave',
          tid: this.__activeTid,
          seq: this.__activeSeq,
          code: this.__activeCode,
          name: this.__helperName,
          offset: '0x' + this.__helperOffset.toString(16),
          ret: p(retval),
          durMs: durMs,
        });
      },
    });

    emit({
      t: 'hook_ok',
      name: target.name,
      offset: '0x' + target.offset.toString(16),
      address: addr.toString(),
    });
  }

  function install() {
    if (hooksInstalled) return true;
    var mod = Process.findModuleByName('libnms.so');
    var base = mod ? mod.base : null;
    if (!base) return false;

    for (var i = 0; i < TARGETS.length; i += 1) {
      try {
        hookAt(base, TARGETS[i]);
      } catch (e) {
        emit({
          t: 'hook_fail',
          name: TARGETS[i].name,
          offset: '0x' + TARGETS[i].offset.toString(16),
          error: String(e),
        });
      }
    }
    hooksInstalled = true;
    emit({ t: 'ready', name: 'gs25-pgl-meta-native-trace' });
    return true;
  }

  if (!install()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (install() || tries >= 120) {
        clearInterval(timer);
        if (!hooksInstalled) {
          emit({ t: 'init_fail', reason: 'libnms.so not loaded in time' });
        }
      }
    }, 250);
  }
})();
