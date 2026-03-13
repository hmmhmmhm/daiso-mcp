#!/usr/bin/env node
/**
 * batch manifest(jsonl) 집계기
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: node scripts/gs25-301-replay-batch-summary.mjs <manifest.jsonl>');
  process.exit(1);
}

const [manifestPath] = process.argv.slice(2);
if (!manifestPath) usage();
if (!fs.existsSync(manifestPath)) {
  console.error(`파일을 찾지 못했습니다: ${manifestPath}`);
  process.exit(1);
}

const rows = fs
  .readFileSync(manifestPath, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const byMode = {};
const byTuple = {};
let totalApplied = 0;
let totalResults = 0;
const statusCounts = {};

for (const r of rows) {
  const mode = String(r.mode || '<none>');
  const tuple = `${r.tupleFile || '<none>'}:${r.tupleIdx ?? 0}`;
  const applied = Number(r.summary?.counts?.applied || 0);
  const results = Number(r.summary?.counts?.results || 0);
  totalApplied += applied;
  totalResults += results;

  byMode[mode] = byMode[mode] || { runs: 0, applied: 0, results: 0 };
  byMode[mode].runs += 1;
  byMode[mode].applied += applied;
  byMode[mode].results += results;

  byTuple[tuple] = byTuple[tuple] || { runs: 0, applied: 0, results: 0 };
  byTuple[tuple].runs += 1;
  byTuple[tuple].applied += applied;
  byTuple[tuple].results += results;

  const st = r.summary?.statusCounts || {};
  for (const [k, v] of Object.entries(st)) {
    statusCounts[k] = (statusCounts[k] || 0) + Number(v || 0);
  }
}

const out = {
  manifestPath,
  runCount: rows.length,
  totals: {
    applied: totalApplied,
    results: totalResults,
  },
  statusCounts,
  byMode,
  byTuple,
};

console.log(JSON.stringify(out, null, 2));
