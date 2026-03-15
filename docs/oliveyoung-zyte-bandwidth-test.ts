#!/usr/bin/env node

/**
 * Zyte 경유 올리브영 API 호출의 전송량(바이트) 계측 스크립트
 *
 * 사용 예시:
 *   npx tsx docs/oliveyoung-zyte-bandwidth-test.ts --loop=10 --keyword=선크림 --store=명동
 */

import { existsSync, readFileSync } from 'node:fs';

const OY_BASE_URL = 'https://www.oliveyoung.co.kr';
const ZYTE_API_URL = 'https://api.zyte.com/v1/extract';

function loadEnvFile() {
  if (!existsSync('.env')) return;

  const raw = readFileSync('.env', 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = value;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    loop: 10,
    keyword: '선크림',
    store: '명동',
  };

  for (const arg of args) {
    if (arg.startsWith('--loop=')) out.loop = Number(arg.split('=')[1]) || out.loop;
    if (arg.startsWith('--keyword=')) out.keyword = arg.split('=')[1] || out.keyword;
    if (arg.startsWith('--store=')) out.store = arg.split('=')[1] || out.store;
  }

  return out;
}

function bytesOf(value) {
  return Buffer.byteLength(value, 'utf8');
}

function decodeBase64(value) {
  if (typeof value !== 'string') return '';
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return value;
  }
}

function buildStoreBody(searchWords) {
  return {
    lat: 37.56409158001314,
    lon: 126.98517710459745,
    pageIdx: 1,
    searchWords,
    pogKeys: '',
    serviceKeys: '',
    mapLat: 37.56409158001314,
    mapLon: 126.98517710459745,
  };
}

function buildStockBody(keyword) {
  return {
    includeSoldOut: false,
    keyword,
    page: 1,
    sort: '01',
    size: 20,
  };
}

async function postViaZyte(path, body) {
  const apiKey = process.env.ZYTE_API_KEY;
  if (!apiKey) {
    throw new Error('ZYTE_API_KEY가 비어 있습니다. .env 또는 환경변수를 확인하세요.');
  }

  const requestText = JSON.stringify(body);
  const zytePayload = {
    url: `${OY_BASE_URL}${path}`,
    httpRequestMethod: 'POST',
    customHttpRequestHeaders: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Accept', value: 'application/json' },
      { name: 'X-Requested-With', value: 'XMLHttpRequest' },
    ],
    httpRequestText: requestText,
    httpResponseBody: true,
    httpResponseHeaders: true,
  };

  const zytePayloadText = JSON.stringify(zytePayload);
  const auth = Buffer.from(`${apiKey}:`).toString('base64');

  const res = await fetch(ZYTE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: zytePayloadText,
  });

  const zyteResponseText = await res.text();
  let zyteJson = null;
  try {
    zyteJson = JSON.parse(zyteResponseText);
  } catch {
    zyteJson = { raw: zyteResponseText };
  }

  const upstreamResponseText = decodeBase64(zyteJson?.httpResponseBody);
  let upstreamJson = null;
  try {
    upstreamJson = JSON.parse(upstreamResponseText);
  } catch {
    upstreamJson = null;
  }

  return {
    zyteStatus: res.status,
    upstreamStatus: zyteJson?.statusCode ?? null,
    zyteRequestBytes: bytesOf(zytePayloadText),
    zyteResponseBytes: bytesOf(zyteResponseText),
    upstreamRequestBytes: bytesOf(requestText),
    upstreamResponseBytes: bytesOf(upstreamResponseText),
    upstreamApiStatus: upstreamJson?.status ?? null,
    upstreamTotalCount: upstreamJson?.data?.totalCount ?? null,
  };
}

function summarizeRuns(label, runs) {
  const count = runs.length;
  const sum = (key) => runs.reduce((acc, cur) => acc + cur[key], 0);

  const summary = {
    label,
    count,
    success: runs.filter((v) => v.zyteStatus === 200 && v.upstreamStatus === 200).length,
    avg: {
      zyteRequestBytes: Math.round(sum('zyteRequestBytes') / count),
      zyteResponseBytes: Math.round(sum('zyteResponseBytes') / count),
      upstreamRequestBytes: Math.round(sum('upstreamRequestBytes') / count),
      upstreamResponseBytes: Math.round(sum('upstreamResponseBytes') / count),
    },
    total: {
      zyteRequestBytes: sum('zyteRequestBytes'),
      zyteResponseBytes: sum('zyteResponseBytes'),
      upstreamRequestBytes: sum('upstreamRequestBytes'),
      upstreamResponseBytes: sum('upstreamResponseBytes'),
    },
  };

  summary.avg.zyteRoundTripBytes = summary.avg.zyteRequestBytes + summary.avg.zyteResponseBytes;
  summary.total.zyteRoundTripBytes = summary.total.zyteRequestBytes + summary.total.zyteResponseBytes;

  return summary;
}

function estimateForScale(avgBytesPerCall, calls) {
  const totalBytes = avgBytesPerCall * calls;
  const totalKB = totalBytes / 1024;
  const totalMB = totalKB / 1024;
  const totalGB = totalMB / 1024;

  return {
    calls,
    totalBytes: Math.round(totalBytes),
    totalKB: Number(totalKB.toFixed(2)),
    totalMB: Number(totalMB.toFixed(2)),
    totalGB: Number(totalGB.toFixed(4)),
  };
}

async function main() {
  loadEnvFile();
  const { loop, keyword, store } = parseArgs();

  const storeRuns = [];
  const stockRuns = [];

  for (let i = 0; i < loop; i += 1) {
    const storeRun = await postViaZyte('/oystore/api/storeFinder/find-store', buildStoreBody(store));
    const stockRun = await postViaZyte('/oystore/api/stock/product-search-v3', buildStockBody(keyword));
    storeRuns.push(storeRun);
    stockRuns.push(stockRun);
  }

  const storeSummary = summarizeRuns('find-store', storeRuns);
  const stockSummary = summarizeRuns('product-search-v3', stockRuns);

  const combinedAvgBytesPerCall =
    Math.round((storeSummary.avg.zyteRoundTripBytes + stockSummary.avg.zyteRoundTripBytes) / 2);

  const estimates = {
    calls1000: estimateForScale(combinedAvgBytesPerCall, 1000),
    calls10000: estimateForScale(combinedAvgBytesPerCall, 10000),
    calls100000: estimateForScale(combinedAvgBytesPerCall, 100000),
  };

  console.log(JSON.stringify({ loop, storeSummary, stockSummary, combinedAvgBytesPerCall, estimates }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
