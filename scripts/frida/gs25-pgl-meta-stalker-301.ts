/*
 * GS25 libnms meta(code=301) helper(FUN_00128654) 호출 트레이스 수집기
 *
 * 목적:
 * - code=301일 때 FUN_00128654 구간만 Stalker를 켜서
 *   field#4 생성 전후의 libnms 내부 호출 오프셋을 집계
 */
/* global Process, Interceptor, Stalker, ptr, console, setInterval, clearInterval */

'use strict';

(function () {
  var LOG_LIMIT = 2000;
  var logCount = 0;
  var hooksInstalled = false;
  var libnms = null;
  var metaOffset = 0x39894;
  var helper301Offset = 0x28654;
  var activeMeta = Object.create(null); // tid -> { seq, code, startedAt }
  var activeTrace = Object.create(null); // tid -> { seq, calls: Map, startedAt }
  var seq = 0;

  function emit(e) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    if (e && typeof e === 'object' && e.ts === undefined) {
      e.ts = Date.now();
    }
    console.log('[GS25_PGL_STALK301] ' + JSON.stringify(e));
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

  function isInLibnms(addrStr) {
    try {
      var a = ptr(addrStr);
      return a.compare(libnms.base) >= 0 && a.compare(libnms.base.add(libnms.size)) < 0;
    } catch {
      return false;
    }
  }

  function startStalker(tid, seqNo) {
    if (activeTrace[tid]) return;
    var state = {
      seq: seqNo,
      startedAt: Date.now(),
      calls: new Map(),
    };
    activeTrace[tid] = state;
    Stalker.follow(tid, {
      events: { call: true },
      onCallSummary: function (summary) {
        var st = activeTrace[tid];
        if (!st) return;
        var keys = Object.keys(summary);
        for (var i = 0; i < keys.length; i += 1) {
          var k = keys[i];
          if (!isInLibnms(k)) continue;
          st.calls.set(k, (st.calls.get(k) || 0) + Number(summary[k] || 0));
        }
      },
    });
    emit({ t: 'trace_start', tid: tid, seq: seqNo });
  }

  function stopStalker(tid, helperRet) {
    var st = activeTrace[tid];
    if (!st) return;
    try {
      Stalker.unfollow(tid);
      Stalker.flush();
      Stalker.garbageCollect();
    } catch {
      // ignore
    }
    var calls = [];
    st.calls.forEach(function (count, addr) {
      var p = ptr(addr);
      calls.push({
        address: p.toString(),
        offset: '0x' + p.sub(libnms.base).toString(16),
        count: count,
      });
    });
    calls.sort(function (a, b) {
      return b.count - a.count;
    });
    emit({
      t: 'trace_stop',
      tid: tid,
      seq: st.seq,
      durMs: Date.now() - st.startedAt,
      helperRet: helperRet || null,
      totalUniqueCalls: calls.length,
      topCalls: calls.slice(0, 50),
    });
    delete activeTrace[tid];
  }

  function install() {
    if (hooksInstalled) return true;
    libnms = Process.findModuleByName('libnms.so');
    if (!libnms) return false;

    var metaAddr = libnms.base.add(metaOffset);
    var helperAddr = libnms.base.add(helper301Offset);

    Interceptor.attach(metaAddr, {
      onEnter: function (args) {
        var code = -1;
        try {
          code = args[2].toInt32();
        } catch {
          code = -1;
        }
        if (code !== 301) return;
        var tid = getTid(this);
        seq += 1;
        activeMeta[tid] = { seq: seq, code: code, startedAt: Date.now() };
        emit({ t: 'meta301_enter', tid: tid, seq: seq });
      },
      onLeave: function (retval) {
        var tid = getTid(this);
        var st = activeMeta[tid];
        if (!st) return;
        emit({
          t: 'meta301_leave',
          tid: tid,
          seq: st.seq,
          durMs: Date.now() - st.startedAt,
          ret: retval ? retval.toString() : null,
        });
        delete activeMeta[tid];
      },
    });

    Interceptor.attach(helperAddr, {
      onEnter: function () {
        var tid = getTid(this);
        var st = activeMeta[tid];
        if (!st) return;
        this.__traceTid = tid;
        this.__traceSeq = st.seq;
        emit({ t: 'helper301_enter', tid: tid, seq: st.seq });
        startStalker(tid, st.seq);
      },
      onLeave: function (retval) {
        if (this.__traceTid === undefined) return;
        emit({
          t: 'helper301_leave',
          tid: this.__traceTid,
          seq: this.__traceSeq,
          ret: retval ? retval.toString() : null,
        });
        stopStalker(this.__traceTid, retval ? retval.toString() : null);
      },
    });

    hooksInstalled = true;
    emit({
      t: 'hook_ok',
      target: 'meta301+FUN_00128654',
      meta: metaAddr.toString(),
      helper: helperAddr.toString(),
      moduleBase: libnms.base.toString(),
      moduleSize: libnms.size,
    });
    emit({ t: 'ready', name: 'gs25-pgl-meta-stalker-301' });
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
