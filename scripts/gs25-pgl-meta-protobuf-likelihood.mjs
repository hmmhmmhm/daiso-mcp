#!/usr/bin/env node

/**
 * 바이너리 payload의 protobuf wire-format 가능성을 휴리스틱으로 판정합니다.
 *
 * 입력:
 * - export 디렉터리(manifest.json 포함)
 *
 * 출력:
 * - payload별 파싱 결과 + code별 요약
 */

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('사용법: node scripts/gs25-pgl-meta-protobuf-likelihood.mjs <payload-export-dir>');
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
  const likely =
    fields >= 2 && ratio >= 0.85 && unsupported === 0 && consumed === buf.length;
  return { fields, consumed, total: buf.length, ratio, unsupported, likely, examples };
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    usage();
    process.exit(1);
  }
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`manifest.json 없음: ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rows = manifest.exported.map((row) => {
    const buf = fs.readFileSync(row.file);
    const parsed = scanWire(buf);
    return { ...row, ...parsed };
  });

  const byCode = new Map();
  for (const r of rows) {
    if (!byCode.has(r.code)) {
      byCode.set(r.code, { code: r.code, total: 0, likely: 0, fullConsumed: 0 });
    }
    const s = byCode.get(r.code);
    s.total += 1;
    if (r.likely) s.likely += 1;
    if (r.consumed === r.total) s.fullConsumed += 1;
  }

  console.log(
    JSON.stringify(
      {
        source: manifest.source,
        payloadDir: dir,
        totalPayloads: rows.length,
        byCode: [...byCode.values()].sort((a, b) => a.code - b.code),
        rows: rows.map((r) => ({
          code: r.code,
          file: r.file,
          bytes: r.bytes,
          count: r.count,
          fields: r.fields,
          consumed: r.consumed,
          total: r.total,
          ratio: Number(r.ratio.toFixed(4)),
          unsupported: r.unsupported,
          likely: r.likely,
          examples: r.examples,
        })),
      },
      null,
      2,
    ),
  );
}

main();
