#!/usr/bin/env node

/**
 * GS25 meta 네이티브 분기 추적 요약기
 *
 * 입력:
 * - gs25-pgl-meta-native-trace-events.jsonl
 *
 * 출력:
 * - code별 helper 호출 빈도
 * - code별 seq 수(메타 호출 수)
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: node scripts/gs25-pgl-meta-native-trace-summary.mjs <events.jsonl>');
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

function inc(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function main() {
  const input = process.argv[2];
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const seqByCode = new Map();
  const helperByCode = new Map();

  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const code = Number.isFinite(Number(e.code)) ? Number(e.code) : null;
    if (code === null) continue;

    if (e.t === 'meta_enter') {
      const key = `${code}||${String(e.seq ?? '')}`;
      seqByCode.set(key, true);
    }
    if (e.t === 'helper_enter') {
      const helper = String(e.name ?? 'unknown');
      const key = `${code}||${helper}`;
      inc(helperByCode, key);
    }
  }

  const codeSet = new Set();
  for (const key of seqByCode.keys()) codeSet.add(Number(key.split('||')[0]));
  for (const key of helperByCode.keys()) codeSet.add(Number(key.split('||')[0]));

  const codes = [...codeSet].sort((a, b) => a - b);
  const rows = codes.map((code) => {
    const seqCount = [...seqByCode.keys()].filter((k) => Number(k.split('||')[0]) === code).length;
    const helpers = [...helperByCode.entries()]
      .filter(([k]) => Number(k.split('||')[0]) === code)
      .map(([k, count]) => ({
        helper: k.split('||')[1],
        count,
      }))
      .sort((a, b) => b.count - a.count);
    return { code, seqCount, helpers };
  });

  console.log(JSON.stringify({ source: input, totalEvents: events.length, codes: rows }, null, 2));
}

main();

