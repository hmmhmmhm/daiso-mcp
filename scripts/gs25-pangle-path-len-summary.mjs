#!/usr/bin/env node
import fs from 'node:fs';

if (process.argv.length < 3) {
  console.error('사용법: node scripts/gs25-pangle-path-len-summary.mjs <log1> [log2 ...]');
  process.exit(1);
}

const files = process.argv.slice(2);
const hostPath = new Map();
const byPathLen = new Map();

function inc(path, len) {
  if (!byPathLen.has(path)) byPathLen.set(path, new Map());
  const m = byPathLen.get(path);
  m.set(len, (m.get(len) || 0) + 1);
}

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
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
    if (ev.t !== 'direct_dump') continue;
    const host = String(ev.host || '(none)');
    const ascii = String(ev.asciiHead || '');
    const len = Number(ev.len || 0);

    const m = ascii.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s+HTTP\/1\./);
    if (m) {
      const path = m[2];
      hostPath.set(host, path);
      inc(path, len);
      continue;
    }

    const p = hostPath.get(host);
    if (p) inc(`${p}#chunk`, len);
  }
}

const out = [];
for (const [path, lens] of byPathLen.entries()) {
  const topLens = [...lens.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([len, count]) => ({ len: Number(len), count }));
  out.push({
    path,
    total: topLens.reduce((a, b) => a + b.count, 0),
    topLens,
  });
}
out.sort((a, b) => b.total - a.total);

console.log(
  JSON.stringify(
    {
      files,
      byPath: out,
    },
    null,
    2,
  ),
);
