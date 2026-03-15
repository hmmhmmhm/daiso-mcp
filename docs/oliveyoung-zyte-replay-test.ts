#!/usr/bin/env node

/**
 * 올리브영 API를 Zyte 경유로 검증하는 스크립트
 *
 * 사용 예시:
 *   npx tsx docs/oliveyoung-zyte-replay-test.ts
 *   npx tsx docs/oliveyoung-zyte-replay-test.ts --loop=3 --keyword=선크림 --store=명동
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
    loop: 1,
    keyword: '선크림',
    store: '명동',
  };

  for (const arg of args) {
    if (arg.startsWith('--loop=')) out.loop = Number(arg.split('=')[1]) || 1;
    if (arg.startsWith('--keyword=')) out.keyword = arg.split('=')[1] || out.keyword;
    if (arg.startsWith('--store=')) out.store = arg.split('=')[1] || out.store;
  }

  return out;
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

function decodeBodyMaybeBase64(value) {
  if (typeof value !== 'string') return null;
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    if (!decoded.trim()) return null;
    return decoded;
  } catch {
    return value;
  }
}

async function zyteExtract(payload) {
  const apiKey = process.env.ZYTE_API_KEY;
  if (!apiKey) {
    throw new Error('ZYTE_API_KEY가 비어 있습니다. .env 또는 환경변수를 확인하세요.');
  }

  const auth = Buffer.from(`${apiKey}:`).toString('base64');
  const res = await fetch(ZYTE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, json };
}

async function checkHomeChallenge() {
  const res = await zyteExtract({
    url: `${OY_BASE_URL}/`,
    browserHtml: true,
  });

  const html = res.json?.browserHtml || '';
  const challenge =
    html.includes('Just a moment') ||
    html.includes('Enable JavaScript and cookies') ||
    html.includes('안전하고 원활한 올리브영 이용을 위해 접속 정보를 확인 중');

  return {
    label: 'home-challenge',
    ok: res.status === 200 && !challenge,
    zyteStatus: res.status,
    challengeDetected: challenge,
  };
}

async function postOliveyoungApi(path, body) {
  const payload = {
    url: `${OY_BASE_URL}${path}`,
    httpRequestMethod: 'POST',
    customHttpRequestHeaders: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Accept', value: 'application/json' },
      { name: 'X-Requested-With', value: 'XMLHttpRequest' },
    ],
    httpRequestText: JSON.stringify(body),
    httpResponseBody: true,
    httpResponseHeaders: true,
  };

  const res = await zyteExtract(payload);
  const rawBody = decodeBodyMaybeBase64(res.json?.httpResponseBody);

  let parsedBody = null;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsedBody = rawBody ? { raw: rawBody } : null;
  }

  return {
    zyteStatus: res.status,
    httpStatus: res.json?.statusCode || null,
    body: parsedBody,
    raw: res.json,
  };
}

function summarize(label, result) {
  const totalCount = result.body?.data?.totalCount;
  const firstItem =
    result.body?.data?.storeList?.[0]?.storeName || result.body?.data?.serachList?.[0]?.goodsName || null;
  const ok =
    result.zyteStatus === 200 &&
    result.httpStatus === 200 &&
    result.body?.status === 'SUCCESS' &&
    typeof totalCount === 'number';

  return {
    label,
    ok,
    zyteStatus: result.zyteStatus,
    upstreamHttpStatus: result.httpStatus,
    apiStatus: result.body?.status || null,
    totalCount: totalCount ?? null,
    firstItem,
    error: ok ? null : result.raw?.detail || result.raw?.title || result.raw?.type || null,
  };
}

async function main() {
  loadEnvFile();
  const { loop, keyword, store } = parseArgs();

  const home = await checkHomeChallenge();
  console.log(JSON.stringify(home, null, 2));

  let storeOk = 0;
  let stockOk = 0;

  for (let i = 1; i <= loop; i += 1) {
    const storeRes = await postOliveyoungApi('/oystore/api/storeFinder/find-store', buildStoreBody(store));
    const stockRes = await postOliveyoungApi(
      '/oystore/api/stock/product-search-v3',
      buildStockBody(keyword)
    );

    const s1 = summarize(`find-store#${i}`, storeRes);
    const s2 = summarize(`product-search-v3#${i}`, stockRes);
    if (s1.ok) storeOk += 1;
    if (s2.ok) stockOk += 1;

    console.log(JSON.stringify(s1, null, 2));
    console.log(JSON.stringify(s2, null, 2));
  }

  console.log('\n=== Summary ===');
  console.log(`zyte/find-store success: ${storeOk}/${loop}`);
  console.log(`zyte/product-search-v3 success: ${stockOk}/${loop}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
