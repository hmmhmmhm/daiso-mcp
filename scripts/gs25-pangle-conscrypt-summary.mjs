#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('사용법: node scripts/gs25-pangle-conscrypt-summary.mjs <log-file>');
  process.exit(1);
}

const text = fs.readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);
const byHost = new Map();
const byTag = new Map();
const byLen = new Map();
let probes = 0;
let reqs = 0;
let raws = 0;

for (const line of lines) {
  const idx = line.indexOf('[GS25_PANGLE_CONSCRYPT] ');
  if (idx < 0) continue;
  const j = line.slice(idx + '[GS25_PANGLE_CONSCRYPT] '.length).trim();
  let ev;
  try { ev = JSON.parse(j); } catch { continue; }

  if (ev.t === 'write_probe') {
    probes += 1;
    const host = ev.host || '(null)';
    byHost.set(host, (byHost.get(host) || 0) + 1);
    const tag = ev.tag || '(none)';
    byTag.set(tag, (byTag.get(tag) || 0) + 1);
    const lk = String(ev.len ?? -1);
    byLen.set(lk, (byLen.get(lk) || 0) + 1);
  }
  if (ev.t === 'pangle_req') reqs += 1;
  if (ev.t === 'write_raw') raws += 1;
}

function top(map, n = 12) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));
}

console.log(JSON.stringify({
  log: file,
  counts: { probes, pangleReq: reqs, writeRaw: raws },
  topHosts: top(byHost),
  topTags: top(byTag),
  topLens: top(byLen),
}, null, 2));
