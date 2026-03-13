#!/usr/bin/env node

/**
 * GS25 native 이벤트에서 tms31.gsshop.com /msg-api/* 페이로드(d=...) 추출기
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: node scripts/gs25-msg-api-payload-extract.mjs <events.jsonl>');
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

function decodeHexDumpToBytes(s) {
  if (typeof s !== 'string' || s.length === 0) return Buffer.alloc(0);
  const byteTokens = [];
  for (const rawLine of s.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const bytesPart = line.match(/^[0-9a-fA-F]{8}\s+((?:[0-9a-fA-F]{2}\s+)+)/);
    const src = bytesPart ? bytesPart[1] : line.replace(/^[0-9a-fA-F]{8}\s+/, '');
    const tokens = src.match(/\b[0-9a-fA-F]{2}\b/g) ?? [];
    byteTokens.push(...tokens);
  }
  if (byteTokens.length > 0) {
    return Buffer.from(byteTokens.join(''), 'hex');
  }
  const compactHex = s.replace(/[^0-9a-fA-F]/g, '');
  if (compactHex.length >= 2 && compactHex.length % 2 === 0) {
    return Buffer.from(compactHex, 'hex');
  }
  return Buffer.alloc(0);
}

function parseHttp1Requests(bytes) {
  const text = bytes.toString('latin1');
  const reqRe = /(?:^|\r\n)(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+([^\s]+)\s+HTTP\/[0-9.]+\r\n([\s\S]*?)\r\n\r\n([\s\S]*?)(?=(?:\r\n(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+)|$)/gi;
  const out = [];
  let m;
  while ((m = reqRe.exec(text)) !== null) {
    const method = m[1].toUpperCase();
    const path = m[2];
    const headers = m[3] ?? '';
    const body = m[4] ?? '';
    const hostMatch = headers.match(/(?:^|\r\n)Host:\s*([^\r\n]+)/i);
    const host = hostMatch ? hostMatch[1].trim().toLowerCase() : '';
    out.push({ method, path, host, body });
  }
  return out;
}

function safeUrlDecode(s) {
  try {
    return decodeURIComponent((s || '').replace(/\+/g, '%20'));
  } catch {
    return '';
  }
}

function tryBase64Decode(s) {
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) return null;
  try {
    const buf = Buffer.from(cleaned, 'base64');
    if (buf.length === 0) return null;
    return buf;
  } catch {
    return null;
  }
}

function main() {
  const input = process.argv[2];
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const out = [];

  for (const e of events) {
    if (!String(e.t || '').startsWith('ssl_write')) continue;
    const bytes = decodeHexDumpToBytes(String(e.hex ?? ''));
    if (bytes.length === 0) continue;
    const reqs = parseHttp1Requests(bytes);
    for (const r of reqs) {
      if (r.host !== 'tms31.gsshop.com') continue;
      if (!r.path.startsWith('/msg-api/')) continue;
      const dMatch = r.body.match(/(?:^|&)d=([^&]*)/);
      const dRaw = dMatch ? dMatch[1] : '';
      const dDecoded = safeUrlDecode(dRaw);
      const b64 = tryBase64Decode(dDecoded);
      out.push({
        method: r.method,
        path: r.path,
        host: r.host,
        bodyLen: r.body.length,
        dParamLen: dDecoded.length,
        dParamPreview: dDecoded.slice(0, 120),
        dParamBase64DecodedLen: b64 ? b64.length : 0,
      });
    }
  }

  console.log(JSON.stringify({ source: input, count: out.length, items: out }, null, 2));
}

main();
