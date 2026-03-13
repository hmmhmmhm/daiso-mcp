#!/usr/bin/env node

/**
 * Java meta_return(301)와 native pipeline 이벤트를 바이트 단위 비교합니다.
 */

import fs from 'node:fs';

function usage() {
  console.error(
    '사용법: node scripts/gs25-pgl-meta-301-pipeline-compare.mjs <java.jsonl> <pipe.jsonl>',
  );
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

function b64ToBuf(s) {
  let t = String(s ?? '').trim();
  if (!t) return null;
  if (t.startsWith('base64:')) t = t.slice(7);
  t = t.replace(/\s+/g, '');
  if (t.includes('...(truncated)')) return null;
  return Buffer.from(t, 'base64');
}

function readVarint(buf, start) {
  let x = 0n;
  let shift = 0n;
  let i = start;
  while (i < buf.length && i < start + 10) {
    const b = BigInt(buf[i]);
    x |= (b & 0x7fn) << shift;
    i += 1;
    if ((b & 0x80n) === 0n) {
      const asNum = x <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(x) : null;
      return { ok: true, valueNumber: asNum, next: i };
    }
    shift += 7n;
  }
  return { ok: false, next: i };
}

function extractField4(wrapper) {
  let off = 0;
  while (off < wrapper.length) {
    const k = readVarint(wrapper, off);
    if (!k.ok || k.valueNumber === null) return null;
    off = k.next;
    const key = k.valueNumber;
    const wt = key & 0x7;
    const fn = key >>> 3;
    if (wt === 0) {
      const v = readVarint(wrapper, off);
      if (!v.ok) return null;
      off = v.next;
      continue;
    }
    if (wt === 1) {
      if (off + 8 > wrapper.length) return null;
      off += 8;
      continue;
    }
    if (wt === 2) {
      const l = readVarint(wrapper, off);
      if (!l.ok || l.valueNumber === null) return null;
      off = l.next;
      const len = l.valueNumber;
      if (off + len > wrapper.length) return null;
      const bytes = wrapper.subarray(off, off + len);
      off += len;
      if (fn === 4) return bytes;
      continue;
    }
    if (wt === 5) {
      if (off + 4 > wrapper.length) return null;
      off += 4;
      continue;
    }
    return null;
  }
  return null;
}

function main() {
  const javaFile = process.argv[2];
  const pipeFile = process.argv[3];
  if (!javaFile || !pipeFile) {
    usage();
    process.exit(1);
  }
  const java = parseJsonl(javaFile);
  const pipe = parseJsonl(pipeFile);

  const j301 = java.find((e) => e.t === 'meta_return' && Number(e.code) === 301);
  const wrapper = j301 ? b64ToBuf(String(j301.retDeep ?? j301.retPreview ?? '')) : null;
  const field4 = wrapper ? extractField4(wrapper) : null;

  const p2 = pipe.find((e) => e.t === 'fn2ae64_leave' && Number(e.outLen) > 0);
  const p17 = pipe.find((e) => e.t === 'fn17b6c_enter' && Number(e.bufLen) > 0);
  const p2Out = p2 ? b64ToBuf(p2.outB64) : null;
  const p17Buf = p17 ? b64ToBuf(p17.bufB64) : null;

  const out = {
    javaFile,
    pipeFile,
    wrapperLen: wrapper ? wrapper.length : null,
    field4Len: field4 ? field4.length : null,
    fn2ae64OutLen: p2Out ? p2Out.length : null,
    fn17b6cBufLen: p17Buf ? p17Buf.length : null,
    field4EqualsFn2ae64Out: Boolean(field4 && p2Out && field4.equals(p2Out)),
    wrapperEqualsFn17b6cBuf: Boolean(wrapper && p17Buf && wrapper.equals(p17Buf)),
    seq: {
      java301Ts: j301 ? j301.ts ?? null : null,
      fn2ae64Seq: p2 ? p2.seq ?? null : null,
      fn17b6cSeq: p17 ? p17.seq ?? null : null,
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
