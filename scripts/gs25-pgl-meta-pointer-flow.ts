#!/usr/bin/env node

/**
 * GS25 PGL native 포인터 플로우 분석기
 *
 * 입력:
 * - gs25-pgl-meta-native-trace-events.jsonl
 *
 * 출력:
 * - seq/code별 helper_leave ret와 meta_leave ret 일치 여부
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: npx tsx scripts/gs25-pgl-meta-pointer-flow.ts <native-events.jsonl>');
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

function main() {
  const input = process.argv[2];
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const bySeq = new Map();

  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const seq = Number(e.seq);
    const code = Number(e.code);
    if (!Number.isFinite(seq) || !Number.isFinite(code)) continue;
    if (!bySeq.has(seq)) {
      bySeq.set(seq, {
        seq,
        code,
        helperRet: {},
        metaRet: null,
      });
    }
    const row = bySeq.get(seq);
    if (e.t === 'helper_leave') {
      const name = String(e.name ?? '');
      row.helperRet[name] = String(e.ret ?? '');
    } else if (e.t === 'meta_leave') {
      row.metaRet = String(e.ret ?? '');
    }
  }

  const rows = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  const targets = {
    224: 'FUN_00135680',
    227: 'FUN_001177c8',
    301: 'FUN_00128654',
    302: 'FUN_00128384',
    303: 'FUN_001285c4',
  };

  const focus = rows
    .filter((r) => Object.prototype.hasOwnProperty.call(targets, r.code))
    .map((r) => {
      const helper = targets[r.code];
      const helperRet = r.helperRet[helper] ?? null;
      const metaRet = r.metaRet;
      return {
        seq: r.seq,
        code: r.code,
        targetHelper: helper,
        helperRet,
        metaRet,
        pointerEqual: helperRet !== null && metaRet !== null && helperRet === metaRet,
      };
    });

  const summary = {};
  for (const f of focus) {
    const key = String(f.code);
    if (!summary[key]) summary[key] = { total: 0, equal: 0 };
    summary[key].total += 1;
    if (f.pointerEqual) summary[key].equal += 1;
  }

  console.log(
    JSON.stringify(
      {
        source: input,
        totalEvents: events.length,
        focusCount: focus.length,
        byCodePointerEquality: summary,
        focus,
      },
      null,
      2,
    ),
  );
}

main();

