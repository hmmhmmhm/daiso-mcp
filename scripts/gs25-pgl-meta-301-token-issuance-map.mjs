#!/usr/bin/env node
/**
 * 302 token 발급과 301 field#2 소비 매핑 리포트
 *
 * 입력: 캡처 디렉터리 1개 이상
 * 각 디렉터리는 아래 파일을 포함해야 함:
 * - gs25-pgl-meta-events.jsonl
 * - gs25-pgl-meta-301-pipeline-events.jsonl
 */

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(
    '사용법: node scripts/gs25-pgl-meta-301-token-issuance-map.mjs <capture-dir-1> [capture-dir-2 ...]',
  );
  process.exit(1);
}

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map((l) => JSON.parse(l));
}

function readVarint(buf, off) {
  let x = 0n;
  let shift = 0n;
  let i = off;
  while (i < buf.length) {
    const b = BigInt(buf[i]);
    x |= (b & 0x7fn) << shift;
    i += 1;
    if ((b & 0x80n) === 0n) return [x, i];
    shift += 7n;
  }
  throw new Error('eof varint');
}

function parseTop(buf) {
  const out = new Map();
  let i = 0;
  while (i < buf.length) {
    let tag;
    [tag, i] = readVarint(buf, i);
    const field = Number(tag >> 3n);
    const wt = Number(tag & 7n);
    if (wt === 0) {
      let v;
      [v, i] = readVarint(buf, i);
      out.set(field, { wt, value: v.toString() });
      continue;
    }
    if (wt === 2) {
      let l;
      [l, i] = readVarint(buf, i);
      const n = Number(l);
      out.set(field, { wt, value: buf.slice(i, i + n) });
      i += n;
      continue;
    }
    break;
  }
  return out;
}

function b64ToBuf(s) {
  if (!s || typeof s !== 'string' || !s.startsWith('base64:')) return null;
  return Buffer.from(s.slice(7), 'base64');
}

function extractTokenFromInB64(inB64) {
  const buf = b64ToBuf(inB64);
  if (!buf) return null;
  const top = parseTop(buf);
  const f2 = top.get(2);
  if (!f2 || f2.wt !== 2 || !Buffer.isBuffer(f2.value)) return null;
  return f2.value.toString('utf8');
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) usage();

const out = [];
const globalIssued = [];
const pendingConsumed = [];

for (const d of dirs) {
  const javaFile = path.join(d, 'gs25-pgl-meta-events.jsonl');
  const pipeFile = path.join(d, 'gs25-pgl-meta-301-pipeline-events.jsonl');
  const java = readJsonl(javaFile);
  const pipe = readJsonl(pipeFile);

  const issued = java
    .filter((e) => e.t === 'meta_return' && [302, 303].includes(Number(e.code)))
    .map((e) => ({
      ts: Number(e.ts) || null,
      code: Number(e.code) || null,
      token: typeof e.retDeep === 'string' && e.retDeep.length < 128 ? e.retDeep : e.retPreview,
    }))
    .filter((x) => x.ts && x.token);

  const consumed = pipe
    .filter((e) => e.t === 'fn2ae64_leave' && typeof e.inB64 === 'string' && e.inB64.startsWith('base64:'))
    .map((e) => ({
      ts: Number(e.ts) || null,
      seq: Number(e.seq) || null,
      token: extractTokenFromInB64(e.inB64),
    }))
    .filter((x) => x.ts && x.token);

  const rows = consumed.map((c) => {
    const m = issued
      .filter((i) => i.token === c.token)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    const row = {
      seq: c.seq,
      consumedTs: c.ts,
      token: c.token,
      matchedIssuedCode: m ? m.code : null,
      matchedIssuedTs: m ? m.ts : null,
      lagMs: m ? c.ts - m.ts : null,
    };
    pendingConsumed.push({ captureDir: d, row });
    return row;
  });

  for (const i of issued) {
    globalIssued.push({ captureDir: d, ...i });
  }

  out.push({
    captureDir: d,
    issuedCount: issued.length,
    consumedCount: consumed.length,
    issuedTokens: [...new Set(issued.map((x) => x.token))],
    consumedTokens: [...new Set(consumed.map((x) => x.token))],
    rows,
  });
}

for (const c of pendingConsumed) {
  const row = c.row;
  const m = globalIssued
    .filter((i) => i.token === row.token && i.ts <= row.consumedTs)
    .sort((a, b) => b.ts - a.ts)[0];
  row.globalMatchedIssuedTs = m ? m.ts : null;
  row.globalMatchedIssuedCode = m ? m.code : null;
  row.globalMatchedIssuedCapture = m ? m.captureDir : null;
  row.globalLagMs = m ? row.consumedTs - m.ts : null;
}

console.log(
  JSON.stringify(
    {
      captures: out,
      globalIssuedCount: globalIssued.length,
    },
    null,
    2,
  ),
);
