#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const baseDir = process.argv[2] ?? 'captures';

function listRuns(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('gs25-new-autonomous-'))
    .map((e) => path.join(rootDir, e.name))
    .sort((a, b) => b.localeCompare(a));
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function safeCountLines(filePath, pattern) {
  if (!fs.existsSync(filePath)) return 0;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  let n = 0;
  for (const l of lines) {
    if (pattern.test(l)) n += 1;
  }
  return n;
}

function collectRun(runDir) {
  const runName = path.basename(runDir);
  const roundDirs = fs
    .readdirSync(runDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^round-\d+/.test(e.name))
    .map((e) => path.join(runDir, e.name))
    .sort();
  const rounds = [];
  for (const roundDir of roundDirs) {
    const roundName = path.basename(roundDir);
    const summary = readJson(path.join(roundDir, 'round-summary.json')) ?? {};
    const mitmDir = path.join(roundDir, 'mitm');
    const mitmSummary = readJson(path.join(mitmDir, 'summary.json')) ?? {};
    const connectsPath = path.join(mitmDir, 'connects.jsonl');
    const requestsPath = path.join(mitmDir, 'requests.jsonl');
    rounds.push({
      round: roundName,
      profile: summary.profile ?? roundName.replace(/^round-\d+-/, ''),
      isRoundSuccess: Boolean(summary.isRoundSuccess),
      b2cSeen: Boolean(summary.b2cSeen),
      tupleCount: Number(summary.tupleCount ?? 0),
      nextAction: String(summary.nextAction ?? ''),
      woodongsConnects: Number(mitmSummary.woodongsConnectCount ?? safeCountLines(connectsPath, /woodongs/i)),
      woodongsRequests: Number(mitmSummary.woodongsRequestCount ?? safeCountLines(requestsPath, /woodongs/i)),
      woodongsTlsFail: Number(mitmSummary.woodongsTlsFailCount ?? 0),
    });
  }

  const agg = {
    run: runName,
    roundCount: rounds.length,
    successCount: rounds.filter((r) => r.isRoundSuccess).length,
    b2cSeenCount: rounds.filter((r) => r.b2cSeen).length,
    tupleTotal: rounds.reduce((a, r) => a + r.tupleCount, 0),
    woodongsConnectTotal: rounds.reduce((a, r) => a + r.woodongsConnects, 0),
    woodongsRequestTotal: rounds.reduce((a, r) => a + r.woodongsRequests, 0),
    woodongsTlsFailTotal: rounds.reduce((a, r) => a + r.woodongsTlsFail, 0),
    rounds,
  };
  return agg;
}

function renderTable(rows) {
  const header = [
    'run',
    'rounds',
    'b2c',
    'tuple',
    'woodongs_conn',
    'woodongs_req',
    'woodongs_tls_fail',
    'signal',
  ];
  const body = rows.map((r) => [
    r.run,
    String(r.roundCount),
    String(r.b2cSeenCount),
    String(r.tupleTotal),
    String(r.woodongsConnectTotal),
    String(r.woodongsRequestTotal),
    String(r.woodongsTlsFailTotal),
    r.woodongsRequestTotal > 0
      ? 'plaintext'
      : r.woodongsConnectTotal > 0
        ? 'connect_only'
        : 'none',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const fmt = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ');
  const lines = [fmt(header), fmt(widths.map((w) => '-'.repeat(w)))];
  for (const row of body) lines.push(fmt(row));
  return lines.join('\n');
}

const runs = listRuns(path.resolve(cwd, baseDir)).map(collectRun);
const sorted = runs.sort((a, b) => {
  if (b.woodongsRequestTotal !== a.woodongsRequestTotal) {
    return b.woodongsRequestTotal - a.woodongsRequestTotal;
  }
  if (b.b2cSeenCount !== a.b2cSeenCount) {
    return b.b2cSeenCount - a.b2cSeenCount;
  }
  if (b.woodongsConnectTotal !== a.woodongsConnectTotal) {
    return b.woodongsConnectTotal - a.woodongsConnectTotal;
  }
  return b.run.localeCompare(a.run);
});

console.log(renderTable(sorted.slice(0, 25)));
