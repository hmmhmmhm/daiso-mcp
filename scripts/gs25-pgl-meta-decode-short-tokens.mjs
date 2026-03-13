#!/usr/bin/env node

/**
 * GS25 meta 짧은 토큰(code 302/303 등) base64url 디코드 분석기
 *
 * 입력:
 * - gs25-pgl-meta-events.jsonl
 *
 * 옵션:
 * - --codes 302,303
 */

import fs from 'node:fs';

function usage() {
  console.error(
    '사용법: node scripts/gs25-pgl-meta-decode-short-tokens.mjs <java-events.jsonl> [--codes 302,303]',
  );
}

function parseArgs(argv) {
  let codes = [302, 303];
  const pos = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--codes' && i + 1 < argv.length) {
      codes = argv[i + 1]
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isFinite(n));
      i += 1;
      continue;
    }
    pos.push(a);
  }
  return { pos, codes };
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

function toBase64UrlDecoded(token) {
  const p = token.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (p.length % 4)) % 4;
  return Buffer.from(p + '='.repeat(pad), 'base64');
}

function entropy(buf) {
  if (!buf || buf.length === 0) return 0;
  const freq = new Array(256).fill(0);
  for (let i = 0; i < buf.length; i += 1) freq[buf[i]] += 1;
  let h = 0;
  for (let i = 0; i < 256; i += 1) {
    if (freq[i] === 0) continue;
    const p = freq[i] / buf.length;
    h -= p * Math.log2(p);
  }
  return Number(h.toFixed(4));
}

function main() {
  const { pos, codes } = parseArgs(process.argv);
  const input = pos[0];
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const rows = [];
  const seen = new Set();
  for (const e of events) {
    if (!e || e.t !== 'meta_return') continue;
    const code = Number(e.code);
    if (!codes.includes(code)) continue;
    const token = String(e.retDeep ?? e.retPreview ?? '').replace(/^base64:/, '');
    if (!token) continue;
    const key = `${code}|${token}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isBase64UrlCharset = /^[A-Za-z0-9_-]+$/.test(token);
    let decodedLen = null;
    let headHex = null;
    let tailHex = null;
    let ent = null;
    if (isBase64UrlCharset) {
      const b = toBase64UrlDecoded(token);
      decodedLen = b.length;
      headHex = b.subarray(0, Math.min(16, b.length)).toString('hex');
      tailHex = b.subarray(Math.max(0, b.length - 16)).toString('hex');
      ent = entropy(b);
    }

    rows.push({
      code,
      tokenLength: token.length,
      token,
      isBase64UrlCharset,
      decodedLen,
      headHex,
      tailHex,
      entropyBitsPerByte: ent,
    });
  }

  rows.sort((a, b) => a.code - b.code || a.token.localeCompare(b.token));

  console.log(
    JSON.stringify(
      {
        source: input,
        codes,
        totalEvents: events.length,
        uniqueTokenCount: rows.length,
        tokens: rows,
      },
      null,
      2,
    ),
  );
}

main();

