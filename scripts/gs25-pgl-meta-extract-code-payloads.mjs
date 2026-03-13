#!/usr/bin/env node

/**
 * GS25 PGL meta code별 반환 payload 추출기
 *
 * 입력:
 * - gs25-pgl-meta-events.jsonl
 *
 * 옵션:
 * - --codes 301,302,303
 * - --max-preview 200
 *
 * 출력:
 * - code별 unique payload 목록
 */

import fs from 'node:fs';

function usage() {
  console.error(
    '사용법: node scripts/gs25-pgl-meta-extract-code-payloads.mjs <java-events.jsonl> [--codes 301,302,303] [--max-preview 200]',
  );
}

function parseArgs(argv) {
  let codes = null;
  let maxPreview = 200;
  const pos = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--codes' && i + 1 < argv.length) {
      codes = argv[i + 1]
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v));
      i += 1;
      continue;
    }
    if (a === '--max-preview' && i + 1 < argv.length) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) maxPreview = n;
      i += 1;
      continue;
    }
    pos.push(a);
  }
  return { pos, codes, maxPreview };
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

function preview(s, maxPreview) {
  const t = String(s ?? '');
  if (t.length <= maxPreview) return t;
  return t.slice(0, maxPreview) + '...(truncated)';
}

function normalizePayload(retDeep, retPreview) {
  const d = String(retDeep ?? '');
  if (d.startsWith('base64:')) return d.slice(7);
  if (d && d !== 'null') return d;
  const p = String(retPreview ?? '');
  if (p && p !== 'null') return p;
  return '';
}

function main() {
  const { pos, codes, maxPreview } = parseArgs(process.argv);
  const input = pos[0];
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const out = new Map();

  for (const e of events) {
    if (!e || e.t !== 'meta_return') continue;
    const code = Number(e.code);
    if (!Number.isFinite(code)) continue;
    if (codes && !codes.includes(code)) continue;
    const payload = normalizePayload(e.retDeep, e.retPreview);
    if (!payload) continue;

    if (!out.has(code)) out.set(code, new Map());
    const m = out.get(code);
    m.set(payload, (m.get(payload) ?? 0) + 1);
  }

  const rows = [...out.entries()]
    .map(([code, m]) => {
      const payloads = [...m.entries()]
        .map(([payload, count]) => ({
          count,
          length: payload.length,
          preview: preview(payload, maxPreview),
        }))
        .sort((a, b) => b.count - a.count || b.length - a.length);
      return { code, uniqueCount: payloads.length, payloads };
    })
    .sort((a, b) => a.code - b.code);

  console.log(
    JSON.stringify(
      {
        source: input,
        filterCodes: codes,
        totalEvents: events.length,
        codes: rows,
      },
      null,
      2,
    ),
  );
}

main();

