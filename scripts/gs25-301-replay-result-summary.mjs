#!/usr/bin/env node
/**
 * mitmdump raw 로그에서 GS25 replay 적용/결과를 요약합니다.
 *
 * 입력: mitmdump raw log 파일
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: node scripts/gs25-301-replay-result-summary.mjs <mitmdump-raw.log>');
  process.exit(1);
}

const [logPath] = process.argv.slice(2);
if (!logPath) usage();

if (!fs.existsSync(logPath)) {
  console.error(`파일을 찾지 못했습니다: ${logPath}`);
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split('\n');
const applied = [];
const results = [];

for (const line of lines) {
  const idx = line.indexOf('{');
  if (idx < 0) continue;
  const cand = line.slice(idx).trim();
  if (!cand.endsWith('}')) continue;
  let obj;
  try {
    obj = JSON.parse(cand);
  } catch {
    continue;
  }
  if (!obj || typeof obj !== 'object') continue;
  if (obj.tag === 'GS25_REPLAY_APPLIED') applied.push(obj);
  if (obj.tag === 'GS25_REPLAY_RESULT') results.push(obj);
}

const statusCounts = {};
for (const r of results) {
  const k = String(r.status ?? 'null');
  statusCounts[k] = (statusCounts[k] || 0) + 1;
}

const tokenCounts = {};
for (const r of results) {
  const k = String(r.token || '<empty>');
  tokenCounts[k] = (tokenCounts[k] || 0) + 1;
}

const summary = {
  logPath,
  counts: {
    applied: applied.length,
    results: results.length,
    resultWithoutApplyGap: results.length - applied.length,
  },
  statusCounts,
  tokenCounts,
  samples: {
    firstApplied: applied[0] || null,
    firstResult: results[0] || null,
    lastResult: results.length ? results[results.length - 1] : null,
  },
};

console.log(JSON.stringify(summary, null, 2));
