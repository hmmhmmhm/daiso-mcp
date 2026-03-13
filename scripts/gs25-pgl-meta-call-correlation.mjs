#!/usr/bin/env node

/**
 * GS25 PGL meta Java/Native 호출 상관 매칭
 *
 * 입력:
 * - java events jsonl
 * - native events jsonl
 *
 * 출력:
 * - Java meta_return <-> Native meta call(helpers) 최근접 매칭 결과
 */

import fs from 'node:fs';

function usage() {
  console.error(
    '사용법: node scripts/gs25-pgl-meta-call-correlation.mjs <java-events.jsonl> <native-events.jsonl> [--max-delta-ms 2000]',
  );
}

function parseJsonl(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function parseArgs(argv) {
  let maxDeltaMs = 2000;
  const pos = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--max-delta-ms' && i + 1 < argv.length) {
      maxDeltaMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    pos.push(a);
  }
  return { pos, maxDeltaMs: Number.isFinite(maxDeltaMs) ? maxDeltaMs : 2000 };
}

function buildNativeCalls(nativeEvents) {
  const calls = new Map();
  for (const e of nativeEvents) {
    if (!e || typeof e !== 'object') continue;
    const seq = Number(e.seq);
    const code = Number(e.code);
    if (!Number.isFinite(seq) || !Number.isFinite(code)) continue;
    if (!calls.has(seq)) {
      calls.set(seq, {
        seq,
        code,
        tid: Number.isFinite(Number(e.tid)) ? Number(e.tid) : null,
        enterTs: null,
        leaveTs: null,
        ret: null,
        helpers: [],
      });
    }
    const c = calls.get(seq);
    if (e.t === 'meta_enter') {
      c.enterTs = Number.isFinite(Number(e.ts)) ? Number(e.ts) : c.enterTs;
    } else if (e.t === 'meta_leave') {
      c.leaveTs = Number.isFinite(Number(e.ts)) ? Number(e.ts) : c.leaveTs;
      c.ret = e.ret ?? c.ret;
    } else if (e.t === 'helper_enter') {
      c.helpers.push({
        name: String(e.name ?? 'unknown'),
        ts: Number.isFinite(Number(e.ts)) ? Number(e.ts) : null,
      });
    }
  }
  return [...calls.values()].sort((a, b) => a.seq - b.seq);
}

function match(javaReturns, nativeCalls, maxDeltaMs) {
  const byCode = new Map();
  for (const call of nativeCalls) {
    if (!Number.isFinite(call.code)) continue;
    if (!byCode.has(call.code)) byCode.set(call.code, []);
    byCode.get(call.code).push(call);
  }
  for (const arr of byCode.values()) {
    arr.sort((a, b) => {
      const ta = a.leaveTs ?? a.enterTs ?? Number.MAX_SAFE_INTEGER;
      const tb = b.leaveTs ?? b.enterTs ?? Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
  }

  const out = [];
  const usedSeq = new Set();
  for (const jr of javaReturns) {
    const code = jr.code;
    const ts = jr.ts;
    const candidates = byCode.get(code) ?? [];
    let best = null;
    let bestDelta = Number.MAX_SAFE_INTEGER;
    for (const c of candidates) {
      if (usedSeq.has(c.seq)) continue;
      const ct = c.leaveTs ?? c.enterTs;
      if (!Number.isFinite(ct) || !Number.isFinite(ts)) continue;
      const d = Math.abs(ct - ts);
      if (d < bestDelta) {
        best = c;
        bestDelta = d;
      }
    }
    if (best && bestDelta <= maxDeltaMs) {
      usedSeq.add(best.seq);
      out.push({
        code,
        javaTs: ts,
        javaRetClass: jr.retClass,
        javaRetPreview: jr.retPreview,
        javaRetDeep: jr.retDeep,
        nativeSeq: best.seq,
        nativeLeaveTs: best.leaveTs,
        deltaMs: bestDelta,
        nativeHelpers: best.helpers.map((h) => h.name),
      });
    } else {
      out.push({
        code,
        javaTs: ts,
        javaRetClass: jr.retClass,
        javaRetPreview: jr.retPreview,
        javaRetDeep: jr.retDeep,
        nativeSeq: null,
        nativeLeaveTs: null,
        deltaMs: null,
        nativeHelpers: [],
      });
    }
  }
  return out;
}

function main() {
  const { pos, maxDeltaMs } = parseArgs(process.argv);
  const javaPath = pos[0];
  const nativePath = pos[1];
  if (!javaPath || !nativePath) {
    usage();
    process.exit(1);
  }

  const javaEvents = parseJsonl(javaPath);
  const nativeEvents = parseJsonl(nativePath);

  const javaReturns = javaEvents
    .filter((e) => e && e.t === 'meta_return')
    .map((e) => ({
      code: Number(e.code),
      ts: Number(e.ts),
      retClass: String(e.retClass ?? 'unknown'),
      retPreview: String(e.retPreview ?? ''),
      retDeep: String(e.retDeep ?? ''),
    }))
    .filter((e) => Number.isFinite(e.code) && Number.isFinite(e.ts))
    .sort((a, b) => a.ts - b.ts);

  const nativeCalls = buildNativeCalls(nativeEvents);
  const matches = match(javaReturns, nativeCalls, maxDeltaMs);

  console.log(
    JSON.stringify(
      {
        javaSource: javaPath,
        nativeSource: nativePath,
        maxDeltaMs,
        javaReturnCount: javaReturns.length,
        nativeCallCount: nativeCalls.length,
        matchedCount: matches.filter((m) => m.nativeSeq !== null).length,
        unmatchedCount: matches.filter((m) => m.nativeSeq === null).length,
        matches,
      },
      null,
      2,
    ),
  );
}

main();

