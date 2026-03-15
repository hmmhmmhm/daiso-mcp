#!/usr/bin/env node

/**
 * GS25 meta code=301 payload 디코더(휴리스틱)
 *
 * 입력:
 * - gs25-pgl-meta-events.jsonl
 *
 * 동작:
 * - code=301 retDeep(base64:...)를 추출
 * - base64 복원
 * - protobuf wire-format 휴리스틱 파싱
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: npx tsx scripts/gs25-pgl-meta-decode-301.ts <java-events.jsonl>');
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

function readVarint(buf, offset) {
  let x = 0n;
  let shift = 0n;
  let i = offset;
  for (; i < buf.length && i < offset + 10; i += 1) {
    const b = BigInt(buf[i]);
    x |= (b & 0x7fn) << shift;
    if ((b & 0x80n) === 0n) return { value: x, next: i + 1 };
    shift += 7n;
  }
  return null;
}

function printableRatio(buf) {
  if (buf.length === 0) return 0;
  let ok = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const c = buf[i];
    if ((c >= 0x20 && c <= 0x7e) || c === 0x0a || c === 0x0d || c === 0x09) ok += 1;
  }
  return ok / buf.length;
}

function maybeUtf8(buf) {
  try {
    const s = buf.toString('utf8');
    const re = Buffer.from(s, 'utf8');
    if (re.length !== buf.length) return null;
    if (printableRatio(buf) < 0.85) return null;
    return s;
  } catch {
    return null;
  }
}

function shannonEntropy(buf) {
  if (!buf || buf.length === 0) return 0;
  const freq = new Array(256).fill(0);
  for (let i = 0; i < buf.length; i += 1) freq[buf[i]] += 1;
  let h = 0;
  for (let i = 0; i < 256; i += 1) {
    if (freq[i] === 0) continue;
    const p = freq[i] / buf.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function parseProto(buf, depth = 0, maxDepth = 3) {
  const out = [];
  let off = 0;
  while (off < buf.length) {
    const k = readVarint(buf, off);
    if (!k) break;
    off = k.next;
    const key = Number(k.value);
    const field = key >> 3;
    const wire = key & 0x7;
    if (field <= 0) break;

    if (wire === 0) {
      const v = readVarint(buf, off);
      if (!v) break;
      out.push({ field, wire, value: v.value.toString() });
      off = v.next;
      continue;
    }

    if (wire === 1) {
      if (off + 8 > buf.length) break;
      out.push({ field, wire, valueHex: buf.subarray(off, off + 8).toString('hex') });
      off += 8;
      continue;
    }

    if (wire === 2) {
      const l = readVarint(buf, off);
      if (!l) break;
      off = l.next;
      const len = Number(l.value);
      if (!Number.isFinite(len) || len < 0 || off + len > buf.length) break;
      const payload = buf.subarray(off, off + len);
      const utf8 = maybeUtf8(payload);
      const node = {
        field,
        wire,
        len,
        previewHex: payload.subarray(0, Math.min(32, payload.length)).toString('hex'),
      };
      if (utf8) node.utf8 = utf8.length > 200 ? utf8.slice(0, 200) + '...(truncated)' : utf8;
      if (!utf8 && depth < maxDepth) {
        const child = parseProto(payload, depth + 1, maxDepth);
        if (child.length > 0) node.child = child;
      }
      out.push(node);
      off += len;
      continue;
    }

    if (wire === 5) {
      if (off + 4 > buf.length) break;
      out.push({ field, wire, valueHex: buf.subarray(off, off + 4).toString('hex') });
      off += 4;
      continue;
    }

    break;
  }
  return { fields: out, consumed: off, remaining: buf.length - off };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const payloads = [];
  for (const e of events) {
    if (!e || e.t !== 'meta_return' || Number(e.code) !== 301) continue;
    const deep = String(e.retDeep ?? '');
    if (!deep.startsWith('base64:')) continue;
    payloads.push(deep.slice(7));
  }
  const uniq = [...new Set(payloads)];
  const decoded = uniq.map((b64, idx) => {
    const buf = Buffer.from(b64, 'base64');
    return {
      index: idx + 1,
      base64Length: b64.length,
      binaryLength: buf.length,
      parse: parseProto(buf),
      entropyBitsPerByte: Number(shannonEntropy(buf).toFixed(4)),
      tailHex: buf.subarray(Math.max(0, buf.length - 48)).toString('hex'),
    };
  });

  console.log(
    JSON.stringify(
      {
        source: input,
        totalEvents: events.length,
        code301PayloadCount: payloads.length,
        uniquePayloadCount: uniq.length,
        decoded,
      },
      null,
      2,
    ),
  );
}

main();
