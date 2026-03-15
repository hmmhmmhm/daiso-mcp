#!/usr/bin/env node

/**
 * GS25 code301 helper(FUN_00128654) Stalker 요약기
 *
 * 입력:
 * - gs25-pgl-meta-stalker-301-events.jsonl
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: npx tsx scripts/gs25-pgl-meta-stalker-301-summary.ts <events.jsonl>');
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
  const stops = events.filter((e) => e && e.t === 'trace_stop');
  const byOffset = new Map();
  for (const s of stops) {
    const calls = Array.isArray(s.topCalls) ? s.topCalls : [];
    for (const c of calls) {
      const off = String(c.offset ?? '');
      const count = Number(c.count ?? 0);
      if (!off || !Number.isFinite(count)) continue;
      byOffset.set(off, (byOffset.get(off) ?? 0) + count);
    }
  }
  const top = [...byOffset.entries()]
    .map(([offset, count]) => ({ offset, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 80);

  console.log(
    JSON.stringify(
      {
        source: input,
        totalEvents: events.length,
        totalTraces: stops.length,
        topCalls: top,
      },
      null,
      2,
    ),
  );
}

main();
