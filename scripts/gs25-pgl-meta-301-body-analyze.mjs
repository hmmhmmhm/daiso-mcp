#!/usr/bin/env node

/**
 * GS25 meta code301 본문 구조 휴리스틱 분석기
 *
 * 입력:
 * - gs25-pgl-meta-events.jsonl
 *
 * 출력:
 * - header(varint) / body 분리
 * - body 엔트로피, 매직 바이트, 블록 패턴
 * - AES-GCM 유사 레이아웃 후보 여부
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: node scripts/gs25-pgl-meta-301-body-analyze.mjs <java-events.jsonl>');
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
  for (let i = offset; i < Math.min(buf.length, offset + 10); i += 1) {
    const b = BigInt(buf[i]);
    x |= (b & 0x7fn) << shift;
    if ((b & 0x80n) === 0n) {
      return { value: x, next: i + 1 };
    }
    shift += 7n;
  }
  return null;
}

function parseHeader3(buf) {
  let off = 0;
  const fields = [];
  for (let i = 0; i < 3; i += 1) {
    const k = readVarint(buf, off);
    if (!k) return null;
    off = k.next;
    const key = Number(k.value);
    const field = key >> 3;
    const wire = key & 0x7;
    if (wire !== 0 || field <= 0) return null;
    const v = readVarint(buf, off);
    if (!v) return null;
    off = v.next;
    fields.push({ field, value: v.value.toString() });
  }
  return { fields, headerLen: off };
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

function detectMagic(buf) {
  if (buf.length < 4) return [];
  const b0 = buf[0];
  const b1 = buf[1];
  const b2 = buf[2];
  const b3 = buf[3];
  const out = [];
  if (b0 === 0x1f && b1 === 0x8b) out.push('gzip');
  if (b0 === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b1)) out.push('zlib');
  if (b0 === 0x28 && b1 === 0xb5 && b2 === 0x2f && b3 === 0xfd) out.push('zstd');
  if (b0 === 0x04 && b1 === 0x22 && b2 === 0x4d && b3 === 0x18) out.push('lz4-frame');
  return out;
}

function repeatedBlockRatio(buf, blockSize = 16) {
  if (buf.length < blockSize * 2) return 0;
  const n = Math.floor(buf.length / blockSize);
  const seen = new Set();
  let dup = 0;
  for (let i = 0; i < n; i += 1) {
    const block = buf.subarray(i * blockSize, (i + 1) * blockSize).toString('hex');
    if (seen.has(block)) dup += 1;
    seen.add(block);
  }
  return Number((dup / n).toFixed(4));
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

  const analyzed = uniq.map((b64, idx) => {
    const all = Buffer.from(b64, 'base64');
    const header = parseHeader3(all);
    const headerLen = header ? header.headerLen : 0;
    const body = all.subarray(headerLen);
    const bodyEntropy = entropy(body);
    const bodyMagic = detectMagic(body);
    const rep16 = repeatedBlockRatio(body, 16);
    const rep8 = repeatedBlockRatio(body, 8);

    const gcmCandidate =
      body.length > 28 && (body.length - 28) % 16 === 0
        ? {
            possible: true,
            nonceLen: 12,
            ciphertextLen: body.length - 28,
            tagLen: 16,
            nonceHex: body.subarray(0, 12).toString('hex'),
            tagHex: body.subarray(body.length - 16).toString('hex'),
          }
        : { possible: false };

    return {
      index: idx + 1,
      base64Length: b64.length,
      binaryLength: all.length,
      header: header ? header.fields : [],
      headerLen,
      bodyLength: body.length,
      bodyHeadHex: body.subarray(0, Math.min(32, body.length)).toString('hex'),
      bodyTailHex: body.subarray(Math.max(0, body.length - 32)).toString('hex'),
      bodyEntropyBitsPerByte: bodyEntropy,
      bodyMagic,
      repeatedBlockRatio16: rep16,
      repeatedBlockRatio8: rep8,
      aesGcmLikeLayout: gcmCandidate,
    };
  });

  console.log(
    JSON.stringify(
      {
        source: input,
        totalEvents: events.length,
        code301PayloadCount: payloads.length,
        uniquePayloadCount: uniq.length,
        analyzed,
      },
      null,
      2,
    ),
  );
}

main();

