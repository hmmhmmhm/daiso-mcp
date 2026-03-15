#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('사용법: npx tsx scripts/gs25-pangle-conscrypt-read-summary.ts <log-file>');
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const statusCounts = new Map();
let readHint = 0;
let replayApplied = 0;
let replayAfterPathApplied = 0;
let pangleReq = 0;

for (const line of lines) {
  const i = line.indexOf('[GS25_PANGLE_CONSCRYPT] ');
  if (i < 0) continue;
  const s = line.slice(i + '[GS25_PANGLE_CONSCRYPT] '.length).trim();
  let ev;
  try { ev = JSON.parse(s); } catch { continue; }

  if (ev.t === 'direct_replay_applied') replayApplied += 1;
  if (ev.t === 'direct_replay_after_path_applied') replayAfterPathApplied += 1;
  if (ev.t === 'pangle_req') pangleReq += 1;
  if (ev.t !== 'read_hint') continue;
  readHint += 1;

  const ascii = String(ev.asciiHead || '');
  const m = ascii.match(/HTTP\/\d\.\d\s+(\d{3})/);
  if (m) {
    const code = m[1];
    statusCounts.set(code, (statusCounts.get(code) || 0) + 1);
  }
}

console.log(JSON.stringify({
  log: file,
  counts: {
    readHint,
    pangleReq,
    replayApplied,
    replayAfterPathApplied,
    replayAppliedTotal: replayApplied + replayAfterPathApplied,
  },
  statusCounts: Object.fromEntries([...statusCounts.entries()].sort((a,b)=>a[0].localeCompare(b[0]))),
}, null, 2));
