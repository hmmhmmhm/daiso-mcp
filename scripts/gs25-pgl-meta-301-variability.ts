#!/usr/bin/env node
/**
 * GS25 code=301 파이프라인 런 간 변동성 비교 도구
 *
 * 비교 항목:
 * - fn2ae64 inB64 / outB64
 * - fn17b6c bufB64
 * - protobuf top-level 필드 변화(입력 기준)
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

function usage() {
  console.error(
    '사용법: npx tsx scripts/gs25-pgl-meta-301-variability.ts <eventsA.jsonl> <eventsB.jsonl>',
  );
  process.exit(1);
}

function loadEvents(path) {
  const raw = fs.readFileSync(path, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map((l) => JSON.parse(l));
}

function pickBuf(events, t, key) {
  const e = events.find((x) => x.t === t && typeof x[key] === 'string' && x[key].startsWith('base64:'));
  if (!e) return null;
  return Buffer.from(e[key].slice(7), 'base64');
}

function countDiff(a, b) {
  if (!a || !b) return null;
  let diff = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) diff += 1;
  return diff + Math.abs(a.length - b.length);
}

function diffRanges(a, b) {
  if (!a || !b) return [];
  const n = Math.min(a.length, b.length);
  const out = [];
  let s = -1;
  for (let i = 0; i < n; i += 1) {
    const changed = a[i] !== b[i];
    if (changed && s < 0) s = i;
    if (!changed && s >= 0) {
      out.push([s, i - 1]);
      s = -1;
    }
  }
  if (s >= 0) out.push([s, n - 1]);
  if (a.length !== b.length) out.push([n, Math.max(a.length, b.length) - 1]);
  return out;
}

function readVarint(buf, off) {
  let x = 0n;
  let shift = 0n;
  let i = off;
  while (i < buf.length) {
    const c = BigInt(buf[i]);
    x |= (c & 0x7fn) << shift;
    i += 1;
    if ((c & 0x80n) === 0n) return [x, i];
    shift += 7n;
  }
  throw new Error('eof varint');
}

function parseTopLevel(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    let tag;
    [tag, i] = readVarint(buf, i);
    const field = Number(tag >> 3n);
    const wt = Number(tag & 7n);
    if (wt === 0) {
      let v;
      [v, i] = readVarint(buf, i);
      out.push({ field, wt, value: v.toString() });
      continue;
    }
    if (wt === 2) {
      let l;
      [l, i] = readVarint(buf, i);
      const n = Number(l);
      const chunk = buf.slice(i, i + n);
      i += n;
      out.push({
        field,
        wt,
        len: n,
        sha1: crypto.createHash('sha1').update(chunk).digest('hex').slice(0, 12),
        ascii: n <= 80 ? chunk.toString('utf8').replace(/[^\x20-\x7e]/g, '') : '',
      });
      continue;
    }
    break;
  }
  return out;
}

function mapByField(items) {
  const m = new Map();
  for (const it of items) m.set(it.field, it);
  return m;
}

function summarizeFieldChanges(bufA, bufB) {
  if (!bufA || !bufB) return [];
  const a = mapByField(parseTopLevel(bufA));
  const b = mapByField(parseTopLevel(bufB));
  const fields = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
  const changed = [];
  for (const f of fields) {
    const x = a.get(f);
    const y = b.get(f);
    if (!x || !y) {
      changed.push({ field: f, reason: 'missing' });
      continue;
    }
    if (x.wt !== y.wt) {
      changed.push({ field: f, reason: 'wire_type', a: x.wt, b: y.wt });
      continue;
    }
    if (x.wt === 0 && x.value !== y.value) {
      changed.push({ field: f, reason: 'varint', a: x.value, b: y.value });
      continue;
    }
    if (x.wt === 2 && (x.len !== y.len || x.sha1 !== y.sha1)) {
      changed.push({
        field: f,
        reason: 'bytes',
        a: { len: x.len, sha1: x.sha1, ascii: x.ascii },
        b: { len: y.len, sha1: y.sha1, ascii: y.ascii },
      });
    }
  }
  return changed;
}

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) usage();

const ea = loadEvents(aPath);
const eb = loadEvents(bPath);

const aIn = pickBuf(ea, 'fn2ae64_leave', 'inB64');
const bIn = pickBuf(eb, 'fn2ae64_leave', 'inB64');
const aOut = pickBuf(ea, 'fn2ae64_leave', 'outB64');
const bOut = pickBuf(eb, 'fn2ae64_leave', 'outB64');
const aWrap = pickBuf(ea, 'fn17b6c_enter', 'bufB64');
const bWrap = pickBuf(eb, 'fn17b6c_enter', 'bufB64');

const result = {
  files: { a: aPath, b: bPath },
  in: {
    lenA: aIn ? aIn.length : null,
    lenB: bIn ? bIn.length : null,
    equal: aIn && bIn ? aIn.equals(bIn) : null,
    diffBytes: countDiff(aIn, bIn),
    ranges: diffRanges(aIn, bIn),
    changedFields: summarizeFieldChanges(aIn, bIn),
  },
  out: {
    lenA: aOut ? aOut.length : null,
    lenB: bOut ? bOut.length : null,
    equal: aOut && bOut ? aOut.equals(bOut) : null,
    diffBytes: countDiff(aOut, bOut),
    ranges: diffRanges(aOut, bOut),
  },
  wrapper: {
    lenA: aWrap ? aWrap.length : null,
    lenB: bWrap ? bWrap.length : null,
    equal: aWrap && bWrap ? aWrap.equals(bWrap) : null,
    diffBytes: countDiff(aWrap, bWrap),
    ranges: diffRanges(aWrap, bWrap),
  },
};

console.log(JSON.stringify(result, null, 2));
