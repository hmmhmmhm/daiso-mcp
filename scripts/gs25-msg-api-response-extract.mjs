#!/usr/bin/env node

/**
 * GS25 native 이벤트에서 msg-api 요청/응답을 ssl 포인터 기준으로 매칭해 추출합니다.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

function usage() {
  console.error(
    '사용법: node scripts/gs25-msg-api-response-extract.mjs <events.jsonl> [--json-out <path>]',
  );
}

function parseArgs(argv) {
  const args = { input: '', jsonOut: '' };
  if (argv.length < 3) return args;
  args.input = argv[2] ?? '';
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === '--json-out') {
      args.jsonOut = argv[i + 1] ?? '';
      i += 1;
    }
  }
  return args;
}

function parseJsonl(path) {
  const raw = fs.readFileSync(path, 'utf8');
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
  if (byteTokens.length > 0) return Buffer.from(byteTokens.join(''), 'hex');
  const compactHex = s.replace(/[^0-9a-fA-F]/g, '');
  if (compactHex.length >= 2 && compactHex.length % 2 === 0) {
    return Buffer.from(compactHex, 'hex');
  }
  return Buffer.alloc(0);
}

function splitHeaderBody(buf) {
  const marker = Buffer.from('\r\n\r\n', 'latin1');
  const idx = buf.indexOf(marker);
  if (idx < 0) return null;
  return {
    headerBytes: buf.subarray(0, idx),
    bodyBytes: buf.subarray(idx + marker.length),
    consumed: idx + marker.length,
  };
}

function parseHeaders(headerBytes) {
  const text = headerBytes.toString('latin1');
  const lines = text.split('\r\n');
  const firstLine = lines.shift() ?? '';
  const headers = {};
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const k = line.slice(0, colon).trim().toLowerCase();
    const v = line.slice(colon + 1).trim();
    headers[k] = v;
  }
  return { firstLine, headers };
}

function parseHttpRequestFrom(buf, start = 0) {
  const remain = buf.subarray(start);
  const split = splitHeaderBody(remain);
  if (!split) return null;
  const { firstLine, headers } = parseHeaders(split.headerBytes);
  const m = firstLine.match(/^([A-Z]+)\s+(\S+)\s+HTTP\/[0-9.]+$/);
  if (!m) return null;
  const method = m[1];
  const path = m[2];
  const contentLength = Number(headers['content-length'] ?? '0');
  if (!Number.isFinite(contentLength) || contentLength < 0) return null;
  if (split.bodyBytes.length < contentLength) return null;
  const body = split.bodyBytes.subarray(0, contentLength);
  return {
    type: 'request',
    method,
    path,
    host: (headers.host ?? '').toLowerCase(),
    headers,
    body,
    totalBytes: split.consumed + contentLength,
  };
}

function parseChunkedBody(bodyBytes) {
  let offset = 0;
  const chunks = [];
  while (offset < bodyBytes.length) {
    const lineEnd = bodyBytes.indexOf('\r\n', offset, 'latin1');
    if (lineEnd < 0) return null;
    const sizeText = bodyBytes.subarray(offset, lineEnd).toString('latin1').split(';')[0].trim();
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size) || size < 0) return null;
    offset = lineEnd + 2;
    if (size === 0) {
      if (offset + 2 > bodyBytes.length) return null;
      const trailerEnd = bodyBytes.indexOf('\r\n', offset, 'latin1');
      if (trailerEnd < 0) return null;
      const consumed = trailerEnd + 2;
      return { body: Buffer.concat(chunks), consumed };
    }
    if (offset + size + 2 > bodyBytes.length) return null;
    chunks.push(bodyBytes.subarray(offset, offset + size));
    offset += size;
    if (bodyBytes[offset] !== 0x0d || bodyBytes[offset + 1] !== 0x0a) return null;
    offset += 2;
  }
  return null;
}

function parseHttpResponseFrom(buf, start = 0) {
  const remain = buf.subarray(start);
  const split = splitHeaderBody(remain);
  if (!split) return null;
  const { firstLine, headers } = parseHeaders(split.headerBytes);
  const m = firstLine.match(/^HTTP\/[0-9.]+\s+(\d{3})/);
  if (!m) return null;
  const status = Number(m[1]);
  const transferEncoding = (headers['transfer-encoding'] ?? '').toLowerCase();
  const contentLengthRaw = headers['content-length'];
  let body = Buffer.alloc(0);
  let bodyConsumed = 0;
  if (transferEncoding.includes('chunked')) {
    const parsed = parseChunkedBody(split.bodyBytes);
    if (!parsed) return null;
    body = parsed.body;
    bodyConsumed = parsed.consumed;
  } else if (contentLengthRaw !== undefined) {
    const contentLength = Number(contentLengthRaw);
    if (!Number.isFinite(contentLength) || contentLength < 0) return null;
    if (split.bodyBytes.length < contentLength) return null;
    body = split.bodyBytes.subarray(0, contentLength);
    bodyConsumed = contentLength;
  } else {
    return null;
  }
  return {
    type: 'response',
    status,
    headers,
    body,
    totalBytes: split.consumed + bodyConsumed,
  };
}

function maybeDecompress(body, headers) {
  const enc = (headers['content-encoding'] ?? '').toLowerCase();
  try {
    if (enc.includes('gzip')) return zlib.gunzipSync(body);
    if (enc.includes('deflate')) return zlib.inflateSync(body);
  } catch {
    return body;
  }
  return body;
}

function safeTextPreview(buf, max = 160) {
  const text = buf.toString('utf8');
  return text.replace(/\s+/g, ' ').slice(0, max);
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function main() {
  const { input, jsonOut } = parseArgs(process.argv);
  if (!input) {
    usage();
    process.exit(1);
  }

  const events = parseJsonl(input);
  const sslState = new Map();
  const out = [];

  for (const e of events) {
    const t = String(e.t ?? '');
    const ssl = String(e.ssl ?? '');
    if (!ssl || !t.startsWith('ssl_')) continue;
    if (!sslState.has(ssl)) {
      sslState.set(ssl, { writeBuf: Buffer.alloc(0), readBuf: Buffer.alloc(0), pendingReqs: [] });
    }
    const state = sslState.get(ssl);
    const bytes = decodeHexDumpToBytes(String(e.hex ?? ''));
    if (bytes.length === 0) continue;

    if (t.startsWith('ssl_write')) {
      state.writeBuf = Buffer.concat([state.writeBuf, bytes]);
      let advanced = true;
      while (advanced) {
        advanced = false;
        const req = parseHttpRequestFrom(state.writeBuf, 0);
        if (!req) break;
        state.writeBuf = state.writeBuf.subarray(req.totalBytes);
        if (req.host === 'tms31.gsshop.com' && req.path.startsWith('/msg-api/')) {
          const bodyText = req.body.toString('latin1');
          const dMatch = bodyText.match(/(?:^|&)d=([^&]*)/);
          const dRaw = dMatch ? dMatch[1] : '';
          let dDecoded = '';
          try {
            dDecoded = decodeURIComponent(dRaw.replace(/\+/g, '%20'));
          } catch {
            dDecoded = '';
          }
          state.pendingReqs.push({
            ts: e.ts ?? null,
            method: req.method,
            path: req.path,
            host: req.host,
            reqBodyLen: req.body.length,
            dParamLen: dDecoded.length,
            dParamPreview: dDecoded.slice(0, 100),
          });
        }
        advanced = true;
      }
      continue;
    }

    if (t.startsWith('ssl_read')) {
      state.readBuf = Buffer.concat([state.readBuf, bytes]);
      let advanced = true;
      while (advanced) {
        advanced = false;
        const resp = parseHttpResponseFrom(state.readBuf, 0);
        if (!resp) break;
        state.readBuf = state.readBuf.subarray(resp.totalBytes);
        const req = state.pendingReqs.shift() ?? null;
        if (req) {
          const bodyDecompressed = maybeDecompress(resp.body, resp.headers);
          const bodyText = bodyDecompressed.toString('utf8');
          let bodyJsonKeys = [];
          try {
            const parsed = JSON.parse(bodyText);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              bodyJsonKeys = Object.keys(parsed).slice(0, 20);
            }
          } catch {
            bodyJsonKeys = [];
          }
          out.push({
            ssl,
            request: req,
            response: {
              status: resp.status,
              contentType: resp.headers['content-type'] ?? '',
              contentEncoding: resp.headers['content-encoding'] ?? '',
              bodyLenRaw: resp.body.length,
              bodyLenDecoded: bodyDecompressed.length,
              bodySha256: sha256Hex(bodyDecompressed),
              bodyPreview: safeTextPreview(bodyDecompressed),
              bodyJsonKeys,
            },
          });
        }
        advanced = true;
      }
    }
  }

  const summary = {
    source: input,
    count: out.length,
    items: out,
  };

  if (jsonOut) {
    fs.writeFileSync(jsonOut, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(summary, null, 2));
}

main();
