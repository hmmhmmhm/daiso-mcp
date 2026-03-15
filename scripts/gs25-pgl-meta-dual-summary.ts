#!/usr/bin/env node

/**
 * GS25 PGL Java+Native 동시 캡처 요약기
 *
 * 입력:
 * - java events jsonl
 * - native events jsonl
 *
 * 출력:
 * - code별 Java return class 빈도
 * - code별 native helper 빈도
 */

import fs from 'node:fs';

function usage() {
  console.error(
    '사용법: npx tsx scripts/gs25-pgl-meta-dual-summary.ts <java-events.jsonl> <native-events.jsonl>',
  );
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

function inc(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function main() {
  const javaPath = process.argv[2];
  const nativePath = process.argv[3];
  if (!javaPath || !nativePath) {
    usage();
    process.exit(1);
  }

  const javaEvents = parseJsonl(javaPath);
  const nativeEvents = parseJsonl(nativePath);

  const javaRetByCode = new Map();
  const nativeHelperByCode = new Map();
  const codeSet = new Set();

  for (const e of javaEvents) {
    if (!e || e.t !== 'meta_return') continue;
    const code = Number(e.code);
    if (!Number.isFinite(code)) continue;
    codeSet.add(code);
    inc(javaRetByCode, `${code}||${String(e.retClass ?? 'unknown')}`);
  }

  for (const e of nativeEvents) {
    if (!e || e.t !== 'helper_enter') continue;
    const code = Number(e.code);
    if (!Number.isFinite(code)) continue;
    codeSet.add(code);
    inc(nativeHelperByCode, `${code}||${String(e.name ?? 'unknown')}`);
  }

  const codes = [...codeSet].sort((a, b) => a - b);
  const rows = codes.map((code) => {
    const javaReturns = [...javaRetByCode.entries()]
      .filter(([k]) => Number(k.split('||')[0]) === code)
      .map(([k, count]) => ({ retClass: k.split('||')[1], count }))
      .sort((a, b) => b.count - a.count);
    const nativeHelpers = [...nativeHelperByCode.entries()]
      .filter(([k]) => Number(k.split('||')[0]) === code)
      .map(([k, count]) => ({ helper: k.split('||')[1], count }))
      .sort((a, b) => b.count - a.count);
    return { code, javaReturns, nativeHelpers };
  });

  console.log(
    JSON.stringify(
      {
        javaSource: javaPath,
        nativeSource: nativePath,
        javaEventCount: javaEvents.length,
        nativeEventCount: nativeEvents.length,
        codes: rows,
      },
      null,
      2,
    ),
  );
}

main();

