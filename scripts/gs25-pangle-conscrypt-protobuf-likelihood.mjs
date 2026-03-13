#!/usr/bin/env node

/**
 * GS25 pangle conscrypt 로그에서 direct_dump 프레임의 protobuf 가능성을 추정합니다.
 *
 * 입력:
 * - conscrypt 로그 파일
 *
 * 출력:
 * - path별 binary chunk의 protobuf-likelihood 요약(JSON)
 */

import fs from 'node:fs';

function usage() {
  console.error(
    '사용법: node scripts/gs25-pangle-conscrypt-protobuf-likelihood.mjs <conscrypt-log-file>',
  );
}

function readVarint(buf, offset) {
  let x = 0n;
  let shift = 0n;
  let i = offset;
  while (i < buf.length && i < offset + 10) {
    const b = BigInt(buf[i]);
    x |= (b & 0x7fn) << shift;
    i += 1;
    if ((b & 0x80n) === 0n) {
      const asNum = x <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(x) : null;
      return { ok: true, value: x, valueNumber: asNum, next: i };
    }
    shift += 7n;
  }
  return { ok: false, next: i };
}

function scanWire(buf, maxFields = 256) {
  let off = 0;
  let fields = 0;
  let unsupported = 0;
  const examples = [];
  while (off < buf.length && fields < maxFields) {
    const k = readVarint(buf, off);
    if (!k.ok) break;
    const key = k.valueNumber;
    if (!Number.isFinite(key) || key <= 0) break;
    const wireType = key & 0x7;
    const fieldNo = key >>> 3;
    if (fieldNo <= 0) break;
    off = k.next;
    fields += 1;
    if (examples.length < 8) examples.push({ fieldNo, wireType });

    if (wireType === 0) {
      const v = readVarint(buf, off);
      if (!v.ok) break;
      off = v.next;
      continue;
    }
    if (wireType === 1) {
      if (off + 8 > buf.length) break;
      off += 8;
      continue;
    }
    if (wireType === 2) {
      const l = readVarint(buf, off);
      if (!l.ok || l.valueNumber === null) break;
      off = l.next;
      const len = l.valueNumber;
      if (len < 0 || off + len > buf.length) break;
      off += len;
      continue;
    }
    if (wireType === 5) {
      if (off + 4 > buf.length) break;
      off += 4;
      continue;
    }
    unsupported += 1;
    break;
  }

  const consumed = off;
  const ratio = buf.length === 0 ? 0 : consumed / buf.length;
  const likely = fields >= 2 && ratio >= 0.85 && unsupported === 0;
  const first = buf.length > 0 ? buf[0] : -1;
  const prefixLikely =
    unsupported === 0 &&
    consumed >= 10 &&
    fields >= 3 &&
    (first === 0x08 || first === 0x0a || first === 0x12 || first === 0x1a);
  return { fields, consumed, total: buf.length, ratio, unsupported, likely, prefixLikely, examples };
}

function parseRequestPath(asciiHead) {
  if (!asciiHead) return null;
  const m = String(asciiHead).match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s+HTTP\/1\./);
  if (!m) return null;
  return m[2];
}

function isLikelyBinary(asciiHead) {
  if (!asciiHead) return true;
  const s = String(asciiHead);
  if (/^(GET|POST|PUT|PATCH|DELETE)\s+/.test(s)) return false;
  if (/^HTTP\/1\./.test(s)) return false;
  let dots = 0;
  for (const ch of s) if (ch === '.') dots += 1;
  return dots >= Math.floor(s.length * 0.2);
}

function toTopRows(rows, n = 10) {
  return rows
    .sort((a, b) => {
      if (b.likely !== a.likely) return Number(b.likely) - Number(a.likely);
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      if (b.fields !== a.fields) return b.fields - a.fields;
      return b.len - a.len;
    })
    .slice(0, n)
    .map((r) => ({
      host: r.host,
      len: r.len,
      likely: r.likely,
      fields: r.fields,
      consumed: r.consumed,
      total: r.total,
      ratio: Number(r.ratio.toFixed(4)),
      unsupported: r.unsupported,
      prefixLikely: r.prefixLikely,
      examples: r.examples,
      hexHead: r.hexHead.slice(0, 80),
    }));
}

function main() {
  const file = process.argv[2];
  if (!file) {
    usage();
    process.exit(1);
  }
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  const activePathByHost = new Map();
  const byPath = new Map();
  let directDumpTotal = 0;
  let requestStarts = 0;

  for (const line of lines) {
    const idx = line.indexOf('[GS25_PANGLE_CONSCRYPT] ');
    if (idx < 0) continue;
    const j = line.slice(idx + '[GS25_PANGLE_CONSCRYPT] '.length).trim();
    let ev;
    try {
      ev = JSON.parse(j);
    } catch {
      continue;
    }
    if (ev.t !== 'direct_dump') continue;
    directDumpTotal += 1;

    const host = String(ev.host || '(unknown)');
    const asciiHead = String(ev.asciiHead || '');
    const hexHead = String(ev.hexHead || '');
    if (!hexHead || hexHead.length < 2) continue;

    const reqPath = parseRequestPath(asciiHead);
    if (reqPath) {
      activePathByHost.set(host, reqPath);
      requestStarts += 1;
      continue;
    }

    if (!isLikelyBinary(asciiHead)) continue;
    const path = activePathByHost.get(host);
    if (!path) continue;

    let buf;
    try {
      buf = Buffer.from(hexHead, 'hex');
    } catch {
      continue;
    }
    if (buf.length === 0) continue;

    const parsed = scanWire(buf);
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path).push({
      host,
      len: Number(ev.len || 0),
      hexHead,
      ...parsed,
    });
  }

  const summary = [];
  for (const [path, rows] of byPath.entries()) {
    const total = rows.length;
    const likely = rows.filter((r) => r.likely).length;
    const prefixLikely = rows.filter((r) => r.prefixLikely).length;
    const avgRatio =
      total === 0 ? 0 : rows.reduce((acc, r) => acc + r.ratio, 0) / total;
    const avgFields =
      total === 0 ? 0 : rows.reduce((acc, r) => acc + r.fields, 0) / total;
    summary.push({
      path,
      chunks: total,
      likelyChunks: likely,
      prefixLikelyChunks: prefixLikely,
      likelyRatio: total === 0 ? 0 : Number((likely / total).toFixed(4)),
      prefixLikelyRatio: total === 0 ? 0 : Number((prefixLikely / total).toFixed(4)),
      avgParseRatio: Number(avgRatio.toFixed(4)),
      avgFields: Number(avgFields.toFixed(2)),
      sample: toTopRows(rows, 8),
    });
  }

  summary.sort((a, b) => {
    if (b.likelyChunks !== a.likelyChunks) return b.likelyChunks - a.likelyChunks;
    return b.chunks - a.chunks;
  });

  console.log(
    JSON.stringify(
      {
        log: file,
        counts: {
          directDumpTotal,
          requestStarts,
          binaryChunksClassified: summary.reduce((acc, x) => acc + x.chunks, 0),
        },
        byPath: summary,
      },
      null,
      2,
    ),
  );
}

main();
