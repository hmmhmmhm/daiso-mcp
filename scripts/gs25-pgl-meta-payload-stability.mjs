#!/usr/bin/env node

/**
 * GS25 PGL payload 안정성(라운드 간 고유값) 분석기
 *
 * 입력:
 * - gs25-pgl-meta-events.jsonl 파일 경로들
 *
 * 출력:
 * - 파일별 code별 고유 payload 수
 * - 전체 code별 고유 payload 수
 */

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(
    '사용법: node scripts/gs25-pgl-meta-payload-stability.mjs <events1.jsonl> [events2.jsonl ...]',
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

function normalizePayload(e) {
  const d = String(e.retDeep ?? '');
  if (d.startsWith('base64:')) return d.slice(7);
  if (d && d !== 'null') {
    if (d.startsWith('[B@')) return '';
    if (/^\[\s*-?\d+/.test(d) && d.endsWith(']')) {
      try {
        const nums = d
          .slice(1, -1)
          .split(',')
          .map((v) => Number(v.trim()))
          .filter((n) => Number.isFinite(n))
          .map((n) => ((n % 256) + 256) % 256);
        if (nums.length > 0) {
          return Buffer.from(nums).toString('base64');
        }
      } catch {
        // ignore
      }
    }
    return d;
  }
  const p = String(e.retPreview ?? '');
  if (p.startsWith('[B@')) return '';
  if (p && p !== 'null') return p;
  return '';
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    usage();
    process.exit(1);
  }

  const perFile = [];
  const globalByCode = new Map();

  for (const f of files) {
    const events = parseJsonl(f);
    const byCode = new Map();
    for (const e of events) {
      if (!e || e.t !== 'meta_return') continue;
      const code = Number(e.code);
      if (!Number.isFinite(code)) continue;
      if (![301, 302, 303].includes(code)) continue;
      const payload = normalizePayload(e);
      if (!payload) continue;
      if (code === 301 && payload.length < 100) continue;
      if ((code === 302 || code === 303) && payload.length < 20) continue;
      if (!byCode.has(code)) byCode.set(code, new Set());
      byCode.get(code).add(payload);
      if (!globalByCode.has(code)) globalByCode.set(code, new Set());
      globalByCode.get(code).add(payload);
    }
    perFile.push({
      file: f,
      base: path.basename(path.dirname(f)) + '/' + path.basename(f),
      codes: [...byCode.entries()]
        .map(([code, set]) => ({ code, uniqueCount: set.size }))
        .sort((a, b) => a.code - b.code),
    });
  }

  const global = [...globalByCode.entries()]
    .map(([code, set]) => ({ code, uniqueCount: set.size }))
    .sort((a, b) => a.code - b.code);

  console.log(
    JSON.stringify(
      {
        files: perFile,
        global,
      },
      null,
      2,
    ),
  );
}

main();
