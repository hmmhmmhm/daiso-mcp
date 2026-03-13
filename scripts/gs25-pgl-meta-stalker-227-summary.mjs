#!/usr/bin/env node

/**
 * GS25 code227 Stalker 요약기
 *
 * 입력:
 * - gs25-pgl-meta-stalker-227-events.jsonl
 *
 * 출력:
 * - trace_stop topCalls를 합산하여 상위 libnms 오프셋 목록 출력
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: node scripts/gs25-pgl-meta-stalker-227-summary.mjs <events.jsonl>');
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

function inc(map, key, n) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function main() {
  const input = process.argv[2];
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const traceStops = events.filter((e) => e && e.t === 'trace_stop');
  const byOffset = new Map();
  let totalTraces = 0;

  for (const t of traceStops) {
    totalTraces += 1;
    const calls = Array.isArray(t.topCalls) ? t.topCalls : [];
    for (const c of calls) {
      const off = String(c.offset ?? '');
      const cnt = Number(c.count ?? 0);
      if (!off || !Number.isFinite(cnt)) continue;
      inc(byOffset, off, cnt);
    }
  }

  const top = [...byOffset.entries()]
    .map(([offset, count]) => ({ offset, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);

  console.log(
    JSON.stringify(
      {
        source: input,
        totalEvents: events.length,
        totalTraces,
        topCalls: top,
      },
      null,
      2,
    ),
  );
}

main();

