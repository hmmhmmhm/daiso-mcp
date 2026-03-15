#!/usr/bin/env node

/**
 * 올리브영 oystore API 리플레이 테스트 스크립트
 *
 * 사용 예시:
 *   npx tsx docs/oliveyoung-replay-session-test.ts
 *   npx tsx docs/oliveyoung-replay-session-test.ts --mode=browser --loop=3 --keyword=선크림 --store=명동
 */

import { chromium } from 'playwright';

const BASE_URL = 'https://www.oliveyoung.co.kr';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    loop: 1,
    keyword: '선크림',
    store: '명동',
    mode: 'both',
    headless: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--loop=')) out.loop = Number(arg.split('=')[1]) || 1;
    if (arg.startsWith('--keyword=')) out.keyword = arg.split('=')[1] || out.keyword;
    if (arg.startsWith('--store=')) out.store = arg.split('=')[1] || out.store;
    if (arg.startsWith('--mode=')) out.mode = arg.split('=')[1] || out.mode;
    if (arg.startsWith('--headless=')) out.headless = arg.split('=')[1] === 'true';
  }

  return out;
}

async function postJson(path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
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

async function findStoresDirect(searchWords) {
  return postJson('/oystore/api/storeFinder/find-store', {
    ...buildStoreBody(searchWords),
  });
}

async function searchStockProductsDirect(keyword) {
  return postJson('/oystore/api/stock/product-search-v3', {
    ...buildStockBody(keyword),
  });
}

async function createBrowserSession(headless) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await page.waitForTimeout(6_000);

  const visibleText = await page.locator('body').innerText();
  if (visibleText.includes('Just a moment') || visibleText.includes('Enable JavaScript and cookies')) {
    throw new Error('Cloudflare 챌린지를 통과하지 못했습니다. --headless=false로 재시도하세요.');
  }

  return { browser, page };
}

async function browserPost(page, path, body) {
  return page.evaluate(
    async ({ url, payload }) => {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
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
    },
    { url: `${BASE_URL}${path}`, payload: body }
  );
}

function summarize(label, result, channel) {
  const ok = result.status === 200 && result.json?.status === 'SUCCESS';
  const total = result.json?.data?.totalCount;
  const first = result.json?.data?.storeList?.[0]?.storeName ||
    result.json?.data?.serachList?.[0]?.goodsName;

  return {
    label,
    channel,
    ok,
    httpStatus: result.status,
    apiStatus: result.json?.status,
    totalCount: total,
    firstItem: first || null,
  };
}

async function main() {
  const { loop, keyword, store, mode, headless } = parseArgs();

  const directOn = mode === 'both' || mode === 'direct';
  const browserOn = mode === 'both' || mode === 'browser';

  let directStoreOk = 0;
  let directStockOk = 0;
  let browserStoreOk = 0;
  let browserStockOk = 0;

  let browser = null;
  let page = null;

  if (browserOn) {
    const session = await createBrowserSession(headless);
    browser = session.browser;
    page = session.page;
  }

  for (let i = 1; i <= loop; i += 1) {
    if (directOn) {
      const storeRes = await findStoresDirect(store);
      const stockRes = await searchStockProductsDirect(keyword);
      const s1 = summarize(`find-store#${i}`, storeRes, 'direct');
      const s2 = summarize(`product-search-v3#${i}`, stockRes, 'direct');

      if (s1.ok) directStoreOk += 1;
      if (s2.ok) directStockOk += 1;

      console.log(JSON.stringify(s1, null, 2));
      console.log(JSON.stringify(s2, null, 2));
    }

    if (browserOn) {
      const storeRes = await browserPost(page, '/oystore/api/storeFinder/find-store', buildStoreBody(store));
      const stockRes = await browserPost(
        page,
        '/oystore/api/stock/product-search-v3',
        buildStockBody(keyword)
      );
      const s1 = summarize(`find-store#${i}`, storeRes, 'browser');
      const s2 = summarize(`product-search-v3#${i}`, stockRes, 'browser');

      if (s1.ok) browserStoreOk += 1;
      if (s2.ok) browserStockOk += 1;

      console.log(JSON.stringify(s1, null, 2));
      console.log(JSON.stringify(s2, null, 2));
    }
  }

  if (browser) {
    await browser.close();
  }

  console.log('\n=== Summary ===');
  if (directOn) {
    console.log(`direct/find-store success: ${directStoreOk}/${loop}`);
    console.log(`direct/product-search-v3 success: ${directStockOk}/${loop}`);
  }
  if (browserOn) {
    console.log(`browser/find-store success: ${browserStoreOk}/${loop}`);
    console.log(`browser/product-search-v3 success: ${browserStockOk}/${loop}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
