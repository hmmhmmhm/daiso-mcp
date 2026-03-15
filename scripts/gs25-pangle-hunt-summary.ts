#!/usr/bin/env node
import fs from 'node:fs';

if (process.argv.length < 3) {
  console.error('사용법: npx tsx scripts/gs25-pangle-hunt-summary.ts <log1> [log2 ...]');
  process.exit(1);
}

const logs = process.argv.slice(2);
const byPath = new Map();
const byHost = new Map();
const byLog = [];

function inc(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

for (const file of logs) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let pangleReq = 0;
  const seenPaths = new Set();
  for (const line of lines) {
    const idx = line.indexOf('[GS25_PANGLE_CONSCRYPT] ');
    if (idx < 0) continue;
    const raw = line.slice(idx + '[GS25_PANGLE_CONSCRYPT] '.length).trim();
    let ev;
    try {
      ev = JSON.parse(raw);
    } catch {
      continue;
    }
    if (ev.t !== 'pangle_req') continue;
    pangleReq += 1;
    const path = String(ev.path || '(none)');
    const host = String(ev.host || '(none)');
    seenPaths.add(path);
    inc(byPath, path);
    inc(byHost, host);
  }
  byLog.push({
    log: file,
    pangleReq,
    uniquePaths: [...seenPaths],
  });
}

function top(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

console.log(
  JSON.stringify(
    {
      logs,
      totalLogs: logs.length,
      totalPangleReq: byLog.reduce((acc, x) => acc + x.pangleReq, 0),
      byPath: top(byPath),
      byHost: top(byHost),
      byLog,
    },
    null,
    2,
  ),
);
