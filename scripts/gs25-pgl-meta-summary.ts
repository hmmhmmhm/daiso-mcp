#!/usr/bin/env node

/**
 * GS25 PGL meta 이벤트 요약기
 *
 * 입력:
 * - gs25-pgl-meta-events.jsonl
 *
 * 출력:
 * - code별 call/return 횟수
 * - code별 반환 타입 빈도
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: npx tsx scripts/gs25-pgl-meta-summary.ts <events.jsonl>');
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
  const codeCalls = new Map();
  const codeReturns = new Map();
  const codeRetClass = new Map();

  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const code = Number.isFinite(Number(e.code)) ? Number(e.code) : null;
    if (code === null) continue;

    if (e.t === 'meta_call') {
      inc(codeCalls, code);
    } else if (e.t === 'meta_return') {
      inc(codeReturns, code);
      const key = `${code}||${String(e.retClass ?? 'unknown')}`;
      inc(codeRetClass, key);
    }
  }

  const codes = [...new Set([...codeCalls.keys(), ...codeReturns.keys()])].sort((a, b) => a - b);
  const rows = codes.map((code) => {
    const retClasses = [...codeRetClass.entries()]
      .filter(([k]) => k.startsWith(`${code}||`))
      .map(([k, count]) => ({ retClass: k.split('||')[1], count }))
      .sort((a, b) => b.count - a.count);
    return {
      code,
      calls: codeCalls.get(code) ?? 0,
      returns: codeReturns.get(code) ?? 0,
      retClasses,
    };
  });

  console.log(JSON.stringify({ source: input, totalEvents: events.length, codes: rows }, null, 2));
}

main();

