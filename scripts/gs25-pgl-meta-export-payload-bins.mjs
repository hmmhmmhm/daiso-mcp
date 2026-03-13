#!/usr/bin/env node

/**
 * GS25 meta_return payload를 코드별 바이너리 파일로 내보냅니다.
 *
 * 입력:
 * - gs25-pgl-meta-events.jsonl
 *
 * 출력:
 * - <out-dir>/code-<code>/payload-<n>.bin
 * - <out-dir>/manifest.json
 */

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(
    '사용법: node scripts/gs25-pgl-meta-export-payload-bins.mjs <events.jsonl> <out-dir> [--codes 301,302,303]',
  );
}

function parseArgs(argv) {
  let codes = null;
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

function normalizeBase64(s) {
  let t = String(s ?? '').trim();
  if (!t) return null;
  if (t.startsWith('base64:')) t = t.slice(7);
  if (t.includes('...(truncated)')) return null;
  t = t.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/=]+$/.test(t)) return null;
  const pad = (4 - (t.length % 4)) % 4;
  return t + '='.repeat(pad);
}

function decodePayloadFromEvent(e) {
  const candidates = [e.retDeep, e.retPreview]
    .map(normalizeBase64)
    .filter((v) => typeof v === 'string' && v.length > 0);
  for (const b64 of candidates) {
    try {
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > 0) return buf;
    } catch {
      // no-op
    }
  }
  return null;
}

function main() {
  const { pos, codes } = parseArgs(process.argv);
  const input = pos[0];
  const outDir = pos[1];
  if (!input || !outDir) {
    usage();
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const events = parseJsonl(input);
  const uniqueByCode = new Map();
  const manifest = {
    source: input,
    outDir,
    filterCodes: codes,
    createdAt: new Date().toISOString(),
    totalEvents: events.length,
    exported: [],
  };

  for (const e of events) {
    if (!e || e.t !== 'meta_return') continue;
    const code = Number(e.code);
    if (!Number.isFinite(code)) continue;
    if (codes && !codes.includes(code)) continue;
    const buf = decodePayloadFromEvent(e);
    if (!buf) continue;

    const key = buf.toString('base64');
    if (!uniqueByCode.has(code)) uniqueByCode.set(code, new Map());
    const m = uniqueByCode.get(code);
    if (m.has(key)) {
      const row = m.get(key);
      row.count += 1;
      continue;
    }
    m.set(key, { code, count: 1, bytes: buf.length, payloadBase64: key });
  }

  for (const [code, m] of [...uniqueByCode.entries()].sort((a, b) => a[0] - b[0])) {
    const codeDir = path.join(outDir, `code-${code}`);
    fs.mkdirSync(codeDir, { recursive: true });
    const rows = [...m.values()].sort((a, b) => b.count - a.count || b.bytes - a.bytes);
    rows.forEach((row, idx) => {
      const fileName = `payload-${String(idx + 1).padStart(3, '0')}.bin`;
      const filePath = path.join(codeDir, fileName);
      const buf = Buffer.from(row.payloadBase64, 'base64');
      fs.writeFileSync(filePath, buf);
      manifest.exported.push({
        code,
        count: row.count,
        bytes: row.bytes,
        file: filePath,
      });
    });
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ok: true, manifestPath, exported: manifest.exported.length }, null, 2));
}

main();
