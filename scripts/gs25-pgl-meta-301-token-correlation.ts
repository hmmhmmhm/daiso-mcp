#!/usr/bin/env node
/**
 * GS25 code=301 token(field#2)와 out(field#4) 상관 집계기
 *
 * 입력: 301 pipeline events jsonl 파일들
 * 출력: JSON 요약(행 + 토큰/해시 그룹)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function usage() {
  console.error(
    '사용법: npx tsx scripts/gs25-pgl-meta-301-token-correlation.ts <events1.jsonl> [events2.jsonl ...]',
  );
  process.exit(1);
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

function sha12(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

function keyByToken(token) {
  return token || '<null>';
}

const files = process.argv.slice(2);
if (files.length === 0) usage();

const rows = [];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const base = path.basename(path.dirname(f));
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  const evs = lines.map((l) => JSON.parse(l));
  const bySeq = new Map();
  for (const e of evs) {
    const seq = Number(e.seq);
    if (!Number.isFinite(seq) || seq <= 0) continue;
    if (!bySeq.has(seq)) bySeq.set(seq, {});
    const s = bySeq.get(seq);
    if (e.t === 'fn2ae64_leave') s.leave = e;
    if (e.t === 'fn17b6c_enter') s.wrap = e;
  }
  for (const [seq, s] of [...bySeq.entries()].sort((a, b) => a[0] - b[0])) {
    const inBuf = b64ToBuf(s.leave?.inB64);
    const outBuf = b64ToBuf(s.leave?.outB64);
    const wrapBuf = b64ToBuf(s.wrap?.bufB64);
    if (!inBuf || !outBuf || !wrapBuf) continue;

    const inTop = parseTop(inBuf);
    const wrapTop = parseTop(wrapBuf);
    const token = (() => {
      const f2 = inTop.get(2);
      if (!f2 || f2.wt !== 2 || !Buffer.isBuffer(f2.value)) return null;
      return f2.value.toString('utf8');
    })();
    const f5 = (() => {
      const x = wrapTop.get(5);
      return x && x.wt === 0 ? Number(x.value) : null;
    })();
    const outTail = outBuf.slice(Math.max(0, outBuf.length - 144));

    rows.push({
      capture: base,
      seq,
      token,
      tokenSha12: token ? sha12(Buffer.from(token, 'utf8')) : null,
      outLen: outBuf.length,
      outSha12: sha12(outBuf),
      outTailSha12: sha12(outTail),
      wrapperLen: wrapBuf.length,
      wrapperSha12: sha12(wrapBuf),
      f5,
    });
  }
}

const tokenGroups = {};
const tailGroups = {};
for (const r of rows) {
  const tk = keyByToken(r.token);
  const tkArr = tokenGroups[tk] || [];
  tkArr.push({ capture: r.capture, seq: r.seq, outTailSha12: r.outTailSha12, f5: r.f5 });
  tokenGroups[tk] = tkArr;

  const tg = tailGroups[r.outTailSha12] || [];
  tg.push({ capture: r.capture, seq: r.seq, token: r.token, f5: r.f5 });
  tailGroups[r.outTailSha12] = tg;
}

const result = {
  files,
  rowCount: rows.length,
  rows,
  tokenGroupCount: Object.keys(tokenGroups).length,
  tailGroupCount: Object.keys(tailGroups).length,
  tokenGroups,
  tailGroups,
};

console.log(JSON.stringify(result, null, 2));
