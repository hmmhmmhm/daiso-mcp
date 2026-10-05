import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createBrowserLifecycle } from '../../scripts/relay/lifecycle.js';
import { createOliveyoungRelay } from '../../scripts/relay/oliveyoung.js';

const storeBody = {
  lat: 1,
  lon: 1,
  pageIdx: 1,
  searchWords: '',
  pogKeys: '',
  serviceKeys: '',
  mapLat: 1,
  mapLon: 1,
};
const productBody = { includeSoldOut: true, keyword: 'x', page: 1, sort: 'x', size: 1 };
const request = (operation: string, body: Record<string, unknown>, consumer: string) =>
  new Request(`http://localhost/v1/oliveyoung/${operation}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test',
      'x-relay-consumer': consumer.padStart(64, '0'),
    },
    body: JSON.stringify(body),
  });

afterEach(() => vi.useRealTimers());

it('페이지 접속 10초와 URL 준비 25초 뒤 두 operation이 한 페이지로 성공한다', async () => {
  vi.useFakeTimers();
  const page = Object.assign(new EventEmitter(), {
    goto: vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 10000))),
    waitForURL: vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 25000))),
    evaluate: vi.fn().mockResolvedValue({ status: 200, body: { status: 'SUCCESS' } }),
  });
  const context = Object.assign(new EventEmitter(), {
    newPage: vi.fn().mockResolvedValue(page),
    pages: () => [page],
  });
  const owner = {
    browser: { newContext: vi.fn().mockResolvedValue(context) },
    close: vi.fn().mockResolvedValue(undefined),
    rss: vi.fn().mockResolvedValue(100),
    pid: 123,
  };
  const launch = vi.fn().mockResolvedValue(owner);
  const life = createBrowserLifecycle(launch);
  const takeQuota = vi.fn().mockResolvedValue(true);
  const relay = createOliveyoungRelay('test', life.run, { takeQuota });
  try {
    const store = relay(request('find-store', storeBody, '1'));
    await vi.advanceTimersByTimeAsync(0);
    const product = relay(request('product-search-v3', productBody, '2'));
    await vi.advanceTimersByTimeAsync(0);
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(life.status().state).toBe('starting');

    await vi.advanceTimersByTimeAsync(10000);
    expect(page.waitForURL).toHaveBeenCalledTimes(1);
    expect(page.evaluate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25000);

    expect((await store).status).toBe(200);
    expect((await product).status).toBe(200);
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(takeQuota).toHaveBeenCalledTimes(2);
    expect(life.status()).toMatchObject({ state: 'ready', pages: 1, totalCalls: 2 });
  } finally {
    await life.close();
    expect(owner.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  }
});

it.each([35000, 39999])('%i밀리초 브라우저 준비 후 대기한 상품 검색도 성공한다', async (delay) => {
  vi.useFakeTimers();
  const result = { status: 'SUCCESS', data: {} };
  const runner = vi.fn()
    .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(result), delay)))
    .mockResolvedValue(result);
  const takeQuota = vi.fn().mockResolvedValue(true);
  const relay = createOliveyoungRelay('test', runner, { takeQuota });
  const store = relay(request('find-store', storeBody, '1'));
  await vi.advanceTimersByTimeAsync(0);
  expect(runner).toHaveBeenCalledTimes(1);
  const product = relay(request('product-search-v3', productBody, '2'));
  await vi.advanceTimersByTimeAsync(0);
  expect(runner).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(delay);

  expect((await store).status).toBe(200);
  const response = await product;
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(runner).toHaveBeenNthCalledWith(2, '/oystore/api/stock/product-search-v3', productBody);
  expect(takeQuota).toHaveBeenCalledTimes(2);
});

it('브라우저 준비 실패를 성공으로 반환하거나 캐시하지 않고 다음 요청에서 재시도한다', async () => {
  const runner = vi.fn()
    .mockRejectedValueOnce(new Error('startup failed'))
    .mockResolvedValue({ status: 'SUCCESS', data: {} });
  const relay = createOliveyoungRelay('test', runner);
  const failed = await relay(request('find-store', storeBody, '1'));
  expect(failed.status).toBe(502);
  expect(await failed.json()).toEqual({ error: 'Upstream unavailable' });

  const retry = await relay(request('find-store', storeBody, '2'));
  expect(retry.status).toBe(200);
  expect(retry.headers.get('x-relay-cache')).toBe('miss');
  expect(runner).toHaveBeenCalledTimes(2);
  const cached = await relay(request('find-store', storeBody, '3'));
  expect(cached.status).toBe(200);
  expect(cached.headers.get('x-relay-cache')).toBe('hit');
  expect(runner).toHaveBeenCalledTimes(2);
});
