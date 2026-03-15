/*
 * GS25 libnms meta(code=227) 호출 트레이스 수집기
 *
 * 목적:
 * - libnms.so+0x39894(meta)에서 code=227일 때만 Stalker를 켜서
 *   실제 호출된 libnms 내부 함수 오프셋(call target)을 집계
 */
/* global Process, Interceptor, Stalker, ptr, console, setInterval, clearInterval */

'use strict';

(function () {
  var LOG_LIMIT = 2000;
  var logCount = 0;
  var hooksInstalled = false;
  var metaOffset = 0x39894;
  var libnms = null;
  var active = Object.create(null); // tid -> { seq, calls: Map<addr,count>, startedAt }
  var seq = 0;

  function emit(e) {
    if (logCount >= LOG_LIMIT) return;
    logCount += 1;
    if (e && typeof e === 'object' && e.ts === undefined) {
      e.ts = Date.now();
    }
    console.log('[GS25_PGL_STALK227] ' + JSON.stringify(e));
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

  function startTrace(tid, code) {
    seq += 1;
    var state = {
      seq: seq,
      code: code,
      startedAt: Date.now(),
      calls: new Map(),
    };
    active[tid] = state;

    Stalker.follow(tid, {
      events: {
        call: true,
      },
      onCallSummary: function (summary) {
        var st = active[tid];
        if (!st) return;
        var keys = Object.keys(summary);
        for (var i = 0; i < keys.length; i += 1) {
          var k = keys[i];
          if (!isInLibnms(k)) continue;
          var prev = st.calls.get(k) || 0;
          st.calls.set(k, prev + Number(summary[k] || 0));
        }
      },
    });

    emit({ t: 'trace_start', tid: tid, seq: state.seq, code: code });
  }

  function stopTrace(tid, metaRet) {
    var st = active[tid];
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
      var paddr = ptr(addr);
      calls.push({
        address: paddr.toString(),
        offset: '0x' + paddr.sub(libnms.base).toString(16),
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
      code: st.code,
      durMs: Date.now() - st.startedAt,
      metaRet: metaRet || null,
      topCalls: calls.slice(0, 40),
      totalUniqueCalls: calls.length,
    });

    delete active[tid];
  }

  function install() {
    if (hooksInstalled) return true;
    libnms = Process.findModuleByName('libnms.so');
    if (!libnms) return false;

    var metaAddr = libnms.base.add(metaOffset);
    Interceptor.attach(metaAddr, {
      onEnter: function (args) {
        var code = -1;
        try {
          code = args[2].toInt32();
        } catch {
          code = -1;
        }
        if (code !== 227) return;
        var tid = getTid(this);
        this.__traceTid = tid;
        startTrace(tid, code);
      },
      onLeave: function (retval) {
        if (this.__traceTid === undefined) return;
        stopTrace(this.__traceTid, retval ? retval.toString() : null);
      },
    });

    hooksInstalled = true;
    emit({
      t: 'hook_ok',
      target: 'meta_entry_code227',
      address: metaAddr.toString(),
      moduleBase: libnms.base.toString(),
      moduleSize: libnms.size,
    });
    emit({ t: 'ready', name: 'gs25-pgl-meta-stalker-227' });
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

