#!/usr/bin/env node

/**
 * GS25 code301 indirect jump 대상 요약기
 *
 * 입력:
 * - gs25-pgl-meta-301-indirect-events.jsonl
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: node scripts/gs25-pgl-meta-301-indirect-summary.mjs <events.jsonl>');
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
  const byTarget = new Map();
  let totalIndirect = 0;

  for (const e of events) {
    if (!e || e.t !== 'indirect_call') continue;
    totalIndirect += 1;
    const key = String(e.targetOffset ?? e.target ?? '');
    if (!key) continue;
    byTarget.set(key, (byTarget.get(key) ?? 0) + 1);
  }

  const topTargets = [...byTarget.entries()]
    .map(([targetOffset, count]) => ({ targetOffset, count }))
    .sort((a, b) => b.count - a.count);

  console.log(
    JSON.stringify(
      {
        source: input,
        totalEvents: events.length,
        totalIndirect,
        topTargets,
      },
      null,
      2,
    ),
  );
}

main();
