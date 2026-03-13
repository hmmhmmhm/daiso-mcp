#!/usr/bin/env node
/**
 * GS25 code=301 replay tuple 추출기
 *
 * 입력:
 * - 301 pipeline events jsonl
 *
 * 출력:
 * - seq별 replay tuple(JSON):
 *   - token(field#2)
 *   - field4(out)
 *   - wrapper
 *   - wrapper metadata(f1,f2,f3,f5)
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

function usage() {
  console.error(
    '사용법: node scripts/gs25-pgl-meta-301-export-replay-tuples.mjs <pipeline-events.jsonl> [--out out.json]',
  );
  process.exit(1);
}

function readJsonl(path) {
  const raw = fs.readFileSync(path, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map((l) => JSON.parse(l));
}

function b64ToBuf(s) {
  if (!s || typeof s !== 'string' || !s.startsWith('base64:')) return null;
  return Buffer.from(s.slice(7), 'base64');
}

function sha12(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
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
  const m = new Map();
  let i = 0;
  while (i < buf.length) {
    let tag;
    [tag, i] = readVarint(buf, i);
    const field = Number(tag >> 3n);
    const wt = Number(tag & 7n);
    if (wt === 0) {
      let v;
      [v, i] = readVarint(buf, i);
      m.set(field, { wt, value: v.toString() });
      continue;
    }
    if (wt === 2) {
      let l;
      [l, i] = readVarint(buf, i);
      const n = Number(l);
      m.set(field, { wt, value: buf.slice(i, i + n) });
      i += n;
      continue;
    }
    break;
  }
  return m;
}

const args = process.argv.slice(2);
if (args.length === 0) usage();

const input = args[0];
let outPath = '';
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--out') outPath = args[i + 1] || '';
}

const events = readJsonl(input);
const bySeq = new Map();

for (const e of events) {
  const seq = Number(e.seq);
  if (!Number.isFinite(seq) || seq <= 0) continue;
  if (!bySeq.has(seq)) bySeq.set(seq, {});
  const s = bySeq.get(seq);
  if (e.t === 'fn2ae64_leave') s.leave = e;
  if (e.t === 'fn17b6c_enter') s.wrap = e;
}

const tuples = [];
for (const [seq, s] of [...bySeq.entries()].sort((a, b) => a[0] - b[0])) {
  const inBuf = b64ToBuf(s.leave?.inB64);
  const outBuf = b64ToBuf(s.leave?.outB64);
  const wrapBuf = b64ToBuf(s.wrap?.bufB64);
  if (!inBuf || !outBuf || !wrapBuf) continue;

  const inTop = parseTop(inBuf);
  const wrapTop = parseTop(wrapBuf);
  const f2 = inTop.get(2);
  const token =
    f2 && f2.wt === 2 && Buffer.isBuffer(f2.value) ? f2.value.toString('utf8') : null;
  const f1 = wrapTop.get(1)?.value ?? null;
  const f5 = wrapTop.get(5)?.value ?? null;
  const wf4 = wrapTop.get(4);
  const wf4Buf = wf4 && wf4.wt === 2 && Buffer.isBuffer(wf4.value) ? wf4.value : null;

  tuples.push({
    seq,
    ts: Number(s.leave?.ts) || Number(s.wrap?.ts) || null,
    token,
    lengths: {
      in: inBuf.length,
      field4: outBuf.length,
      wrapper: wrapBuf.length,
    },
    hashes: {
      in: sha12(inBuf),
      field4: sha12(outBuf),
      wrapper: sha12(wrapBuf),
      wrapperField4: wf4Buf ? sha12(wf4Buf) : null,
    },
    checks: {
      field4EqualsWrapperField4: Boolean(wf4Buf && wf4Buf.equals(outBuf)),
    },
    wrapperMeta: {
      f1,
      f2: wrapTop.get(2)?.value ?? null,
      f3: wrapTop.get(3)?.value ?? null,
      f5,
    },
    replayTuple: {
      token,
      field4B64: outBuf.toString('base64'),
      wrapperB64: wrapBuf.toString('base64'),
    },
  });
}

const result = {
  input,
  tupleCount: tuples.length,
  tuples,
};

const text = JSON.stringify(result, null, 2);
if (outPath) {
  fs.writeFileSync(outPath, text);
  console.log(outPath);
} else {
  console.log(text);
}
