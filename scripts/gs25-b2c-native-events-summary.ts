#!/usr/bin/env node

/**
 * GS25 b2c native payload 이벤트 요약기
 *
 * 입력:
 * - gs25-b2c-native-events.jsonl
 *
 * 출력:
 * - 요청 라인/경로 빈도
 * - b2c/woodongs/request_e/response_e 포함 여부
 */

import fs from 'node:fs';

function usage() {
  console.error('사용법: npx tsx scripts/gs25-b2c-native-events-summary.ts <events.jsonl>');
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
  const compactHex = s.replace(/[^0-9a-fA-F]/g, '');
  if (compactHex.length >= 2 && compactHex.length % 2 === 0) {
    return Buffer.from(compactHex, 'hex');
  }
  const byteTokens = [];
  for (const rawLine of s.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const bytesPart = line.match(/^[0-9a-fA-F]{8}\s+((?:[0-9a-fA-F]{2}\s+)+)/);
    const src = bytesPart ? bytesPart[1] : line.replace(/^[0-9a-fA-F]{8}\s+/, '');
    const tokens = src.match(/\b[0-9a-fA-F]{2}\b/g) ?? [];
    byteTokens.push(...tokens);
  }
  if (byteTokens.length === 0) return Buffer.alloc(0);
  return Buffer.from(byteTokens.join(''), 'hex');
}

function decodeBytesToPreviewText(bytes) {
  if (!bytes || bytes.length === 0) return '';
  const chars = [];
  for (const v of bytes) {
    if (v >= 32 && v <= 126) {
      chars.push(String.fromCharCode(v));
    } else if (v === 10 || v === 13 || v === 9) {
      chars.push(' ');
    } else {
      chars.push('.');
    }
  }
  return chars.join('').replace(/\s+/g, ' ');
}

function parseHttp1RequestsWithHost(bytes) {
  if (!bytes || bytes.length === 0) return [];
  const text = bytes.toString('latin1');
  const reqRe = /(?:^|\r\n)(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+([^\s]+)\s+HTTP\/[0-9.]+\r\n([\s\S]{0,8192}?)(?:\r\n\r\n|$)/gi;
  const out = [];
  let m;
  while ((m = reqRe.exec(text)) !== null) {
    const method = m[1].toUpperCase();
    const path = m[2].replace(/[^\x20-\x7E]/g, '');
    const headerBlock = m[3] ?? '';
    const hostMatch = headerBlock.match(/(?:^|\r\n)Host:\s*([^\r\n]+)/i);
    let host = hostMatch ? hostMatch[1].trim().toLowerCase() : null;
    if (host && !/^[a-z0-9.\-:]+$/.test(host)) {
      host = null;
    }
    out.push({ method, path, host });
  }
  return out;
}

function inc(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function main() {
  const input = process.argv[2];
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const reqLines = new Map();
  const reqPaths = new Map();
  const reqHosts = new Map();
  const reqHostPath = new Map();
  let totalIo = 0;
  let b2cHintCount = 0;

  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    if (!String(e.t || '').startsWith('ssl_') && !String(e.t || '').startsWith('fd_')) continue;
    totalIo += 1;

    const bytes = decodeHexDumpToBytes(String(e.hex ?? ''));
    const reqs = parseHttp1RequestsWithHost(bytes);
    for (const req of reqs) {
      inc(reqLines, `${req.method} ${req.path}`);
      inc(reqPaths, req.path);
      if (req.host) {
        inc(reqHosts, req.host);
        inc(reqHostPath, `${req.host} ${req.method} ${req.path}`);
      }
    }

    const decoded = decodeBytesToPreviewText(bytes);
    const joined = `${decoded} ${e.ascii ?? ''}`.trim();
    const low = joined.toLowerCase();
    if (
      low.includes('b2c') ||
      low.includes('woodongs') ||
      low.includes('request_e') ||
      low.includes('response_e') ||
      low.includes('/api/bff/') ||
      low.includes('/search/v3/')
    ) {
      b2cHintCount += 1;
    }
  }

  const topReq = [...reqLines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const topPath = [...reqPaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const topHost = [...reqHosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const topHostPath = [...reqHostPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);

  console.log(JSON.stringify(
    {
      source: input,
      totalEvents: events.length,
      totalIoEvents: totalIo,
      b2cHintCount,
      topRequestLines: topReq.map(([line, count]) => ({ line, count })),
      topPaths: topPath.map(([path, count]) => ({ path, count })),
      topHosts: topHost.map(([host, count]) => ({ host, count })),
      topHostRequestLines: topHostPath.map(([line, count]) => ({ line, count })),
    },
    null,
    2,
  ));
}

main();
