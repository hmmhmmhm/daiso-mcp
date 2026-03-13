#!/usr/bin/env node

/**
 * GS25 New 라운드 요약기
 *
 * 라운드 산출물을 읽어 자동 판정용 요약 JSON을 생성합니다.
 */

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(
    '사용법: node scripts/gs25-new-round-summary.mjs <round_dir> [--profile name] [--out file]',
  );
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function tupleCountFromFile(filePath) {
  const data = readJson(filePath);
  if (!data || typeof data !== 'object') return 0;
  return Number.isFinite(Number(data.tupleCount)) ? Number(data.tupleCount) : 0;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const rows = [];
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // 손상 라인은 무시하고 계속 진행
    }
  }
  return rows;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const roundDir = args[0];
  if (!roundDir) {
    usage();
    process.exit(1);
  }

  let profile = '';
  let outPath = '';
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--profile') {
      profile = args[i + 1] || '';
      i += 1;
      continue;
    }
    if (args[i] === '--out') {
      outPath = args[i + 1] || '';
      i += 1;
    }
  }

  return { roundDir, profile, outPath };
}

function nextActionOf({ b2cSeen, b2cHostHit, b2cWoodongsConnectSeen, tupleCount, replaySuccessCount }) {
  if (!b2cSeen) return 'rotate_visibility_profile';
  if (!b2cHostHit && b2cWoodongsConnectSeen) return 'focus_pinning_bypass_for_woodongs';
  if (tupleCount <= 0) return 'expand_301_hook_points';
  if (replaySuccessCount <= 0) return 'token_ttl_probe';
  return 'keep_profile_and_repeat';
}

function main() {
  const { roundDir, profile, outPath } = parseArgs();

  const b2cSummary = readJson(path.join(roundDir, 'b2c-summary.json'));
  const tupleFile = path.join(roundDir, '301-replay-tuples.json');
  const replaySummary = readJson(path.join(roundDir, '301-replay-summary.json'));
  const pglMetaSummary = readJson(path.join(roundDir, 'pgl-meta-summary.json'));
  const mitmConnects = readJsonl(path.join(roundDir, 'mitm', 'connects.jsonl'));

  const topHosts = Array.isArray(b2cSummary?.topHosts) ? b2cSummary.topHosts : [];
  const connectHosts = new Set(
    mitmConnects
      .map((row) => String(row?.request?.host || '').toLowerCase())
      .filter(Boolean),
  );
  const b2cWoodongsConnectSeen =
    connectHosts.has('b2c-pay.woodongs.com') ||
    connectHosts.has('b2c-apigw.woodongs.com') ||
    connectHosts.has('b2c-bff.woodongs.com');
  const woodongsConnectSeen = [...connectHosts].some((h) => h.endsWith('.woodongs.com'));
  const b2cHostHit = topHosts.some((h) => {
    const host = String(h?.host || '');
    return host.includes('b2c-apigw.woodongs.com') || host.includes('b2c-bff.woodongs.com');
  });
  const b2cHintCount = Number(b2cSummary?.b2cHintCount || 0);
  const b2cSeen = b2cHostHit || b2cHintCount > 0 || b2cWoodongsConnectSeen;

  const tupleCount = tupleCountFromFile(tupleFile);

  const statusCounts = replaySummary?.statusCounts ?? {};
  const replaySuccessCount = Number(statusCounts['200'] || 0);
  const replayResultCount = Number(replaySummary?.counts?.results || 0);

  const metaCodeRows = Array.isArray(pglMetaSummary?.codes) ? pglMetaSummary.codes : [];
  const code301 = metaCodeRows.find((row) => Number(row?.code) === 301);
  const code303 = metaCodeRows.find((row) => Number(row?.code) === 303);

  const summary = {
    ts: Date.now(),
    roundDir,
    profile: profile || null,
    b2cSeen,
    b2cHintCount,
    b2cHostHit,
    b2cWoodongsConnectSeen,
    woodongsConnectSeen,
    connectHostCount: connectHosts.size,
    tupleCount,
    replaySuccessCount,
    replayResultCount,
    metaSignals: {
      code301Returns: Number(code301?.returns || 0),
      code303Returns: Number(code303?.returns || 0),
    },
    isRoundSuccess: b2cSeen && tupleCount > 0 && replaySuccessCount > 0,
    nextAction: nextActionOf({
      b2cSeen,
      b2cHostHit,
      b2cWoodongsConnectSeen,
      tupleCount,
      replaySuccessCount,
    }),
  };

  const text = JSON.stringify(summary, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, `${text}\n`, 'utf8');
    console.log(outPath);
    return;
  }
  console.log(text);
}

main();
