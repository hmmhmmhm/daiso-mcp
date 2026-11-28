import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestDirectRoute,
  checkDirectRoute,
  boundedRouteJson,
} from '../../src/utils/directRoutes.js';
import { ROUTE_KEYS } from '../../src/utils/routeHealth.js';
import { directRouteSpecs } from '../../src/utils/directRouteSpecs.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('direct routes', () => {
  it('defines only fixed official routes and pins GS inventory without network access', async () => {
    expect(Object.keys(directRouteSpecs)).toHaveLength(ROUTE_KEYS.length);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(requestDirectRoute('gs25-stock', {}, 3000)).rejects.toThrow('pinned-relay');
    expect(await checkDirectRoute('gs25-stock')).toMatchObject({
      direct: false,
      reason: 'pinned-relay',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('shares strict meaningful response validation with real traffic', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ status: 'SUCCESS', data: {} })),
    );
    await expect(requestDirectRoute('oy-find-store', {}, 3000)).rejects.toThrow('invalid-response');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ status: 'SUCCESS', data: { storeList: [] } })),
    );
    expect(await requestDirectRoute('oy-find-store', {}, 3000)).toMatchObject({
      status: 'SUCCESS',
    });
  });
  it('builds exact stock metadata GET and popword POST query without forwarding credentials', async () => {
    const f = vi.fn().mockResolvedValue(
      Response.json({
        itemCd: '201051',
        smCd: '201051',
        stokMngCd: '201051',
        stokMngQty: 1,
        stockApplicationRate: '100',
      }),
    );
    vi.stubGlobal('fetch', f);
    await requestDirectRoute('seven-stock-meta', { itemCd: '201051' }, 3000);
    expect(String(f.mock.calls[0][0])).toBe(
      'https://new.7-elevenapp.co.kr/api/v1/open/product/search/stock?itemCd=201051',
    );
    expect(f.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
    });
    f.mockResolvedValue(Response.json({ data: [] }));
    await requestDirectRoute('seven-popwords', { label: 'goods' }, 3000);
    expect(String(f.mock.calls[1][0])).toContain('popword?label=goods');
    expect(f.mock.calls[1][1].body).toBe('{}');
  });
  it('fails closed with fixed reasons on HTTP, malformed JSON, and transport failure', async () => {
    for (const response of [
      new Response('denied', { status: 403 }),
      new Response('{'),
      Response.json({}),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      expect(await checkDirectRoute('cu-stock')).toMatchObject({ direct: false });
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private details')));
    expect(await checkDirectRoute('cu-stock')).toMatchObject({ reason: 'network-error' });
  });
  it('bounds stalled fetch and body reads, oversize responses and cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const p = requestDirectRoute('cu-prime', {}, 100);
    const rejected = expect(p).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    vi.useRealTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('x'.repeat(2 * 1024 * 1024 + 1))),
    );
    await expect(requestDirectRoute('cu-prime', {}, 3000)).rejects.toThrow('response-too-large');
    const c = new AbortController();
    c.abort();
    await expect(requestDirectRoute('cu-prime', {}, 3000, c.signal)).rejects.toThrow('cancelled');
  });
});

it('rejects success envelopes missing endpoint data structures', async () => {
  for (const key of [
    'cu-prime',
    'seven-goods',
    'seven-store',
    'seven-popwords',
    'seven-pages',
    'seven-issues',
    'seven-exhibitions',
    'gs25-products',
  ] as const) {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            key === 'cu-prime'
              ? {}
              : key === 'gs25-products'
                ? { SearchQueryResult: {} }
                : { data: {} },
          ),
        ),
    );
    await expect(requestDirectRoute(key, directRouteSpecs[key].probe(), 3000)).rejects.toThrow(
      'invalid-response',
    );
  }
});

it('preserves invalid request HTTP statuses and caller cancellation for route policy', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 422 })));
  await expect(requestDirectRoute('cu-prime', {}, 3000)).rejects.toMatchObject({ status: 422 });
  const caller = new AbortController();
  caller.abort();
  await expect(requestDirectRoute('cu-prime', {}, 3000, caller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

const validResponses: Record<string, unknown> = {
  'oy-find-store': { status: 'SUCCESS', data: { storeList: [] } },
  'oy-product-search': { status: 'SUCCESS', data: { searchList: [] } },
  'oy-goods-info': {
    status: 'SUCCESS',
    data: { goodsInfo: { masterGoodsNumber: '8800362322138' } },
  },
  'oy-stock-stores': { status: 'SUCCESS', data: { storeList: [] } },
  'cu-prime': { resp_cd: '0000', areaCateList: [] },
  'cu-stock': { resp_cd: '0000', data: { stockResult: { result: { rows: [] } } } },
  'cu-store': { resp_cd: '0000', storeList: [] },
  'seven-goods': {
    data: { SearchQueryResult: { Collection: [{ Documentset: { Document: [] } }] } },
  },
  'seven-store': { data: { SearchQueryResult: { Collection: [] } } },
  'seven-popwords': { data: [] },
  'seven-stock-meta': {
    itemCd: '201051',
    smCd: '201051',
    stokMngCd: '201051',
    stokMngQty: 1,
    stockApplicationRate: '100',
  },
  'seven-stock': { data: { storeList: [{ storeCd: '54928', stock: 2 }] } },
  'seven-pages': { data: [] },
  'seven-issues': { data: { content: [] } },
  'seven-exhibitions': { data: { list: [] } },
  'gs25-products': { SearchQueryResult: { Collection: [{ Documentset: { Document: [] } }] } },
  'dtryx-movies': { RetCode: 'success', Recordset: [] },
  'dtryx-play-dates': { RetCode: 'success', Recordset: [] },
  'dtryx-timetable': { RetCode: 'success', Recordset: [] },
};
it('validates every official route fixture and uses the same descriptor for checks', async () => {
  for (const [key, value] of Object.entries(validResponses)) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(value)),
    );
    const check = await checkDirectRoute(key as keyof typeof directRouteSpecs);
    expect(check, key).toMatchObject({ direct: true });
    const request = vi.mocked(fetch).mock.calls[0];
    expect(request[1]).toMatchObject({ redirect: 'manual', credentials: 'omit' });
    expect(new Headers(request[1]?.headers).has('Authorization')).toBe(false);
  }
});
it('rejects endpoint business failure and invalid coordinates instead of accepting empty defaults', async () => {
  for (const key of ['cu-stock', 'cu-store'] as const) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ...(validResponses[key] as object), resp_cd: '3000' })),
    );
    expect(await checkDirectRoute(key)).toMatchObject({
      direct: false,
      reason: 'invalid-response',
    });
  }
  for (const [latVal, longVal] of [
    ['91', '0'],
    ['0', '181'],
  ]) {
    await expect(
      requestDirectRoute(
        'cu-store',
        { ...(directRouteSpecs['cu-store'].probe() as object), latVal, longVal },
        3000,
      ),
    ).rejects.toThrow();
  }
  for (const data of [
    {},
    { success: false, data: [] },
    { data: [], code: 500 },
    { data: [], code: 199 },
    { data: [], code: 300 },
  ]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(data)),
    );
    expect(await checkDirectRoute('seven-pages')).toMatchObject({ direct: false });
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ data: [], success: true, code: 200 })),
  );
  expect(await checkDirectRoute('seven-pages')).toMatchObject({ direct: true });
  await expect(
    requestDirectRoute('dtryx-timetable', { brandCode: 'indieart', cinemaCode: '000067' }, 3000),
  ).rejects.toThrow('invalid-input');
  expect(await checkDirectRoute('cu-store', 0)).toMatchObject({ reason: 'timeout' });
});
it('bounds streaming bodies and supports cancellation after fetch starts', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new ReadableStream({ start() {} }))),
  );
  const pending = requestDirectRoute('cu-prime', {}, 20);
  const assertion = expect(pending).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(20);
  await assertion;
  vi.useRealTimers();
  const caller = new AbortController();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  const cancelled = requestDirectRoute('cu-prime', {}, 3000, caller.signal);
  caller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null)),
  );
  await expect(requestDirectRoute('cu-prime', {}, 3000)).rejects.toThrow('invalid-response');
});

it('absorbs cancellation cleanup failures and classifies invalid probe input', async () => {
  const probe = vi.spyOn(directRouteSpecs['cu-store'], 'probe').mockReturnValue({});
  expect(await checkDirectRoute('cu-store')).toMatchObject({ reason: 'invalid-input' });
  probe.mockRestore();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status: 403,
      body: {
        cancel: async () => {
          throw Error('cancel');
        },
      },
    })),
  );
  expect(await checkDirectRoute('cu-stock')).toMatchObject({ reason: 'http-403' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status: 200,
      body: {
        getReader: () => ({
          read: async () => ({ done: true }),
          cancel: async () => {
            throw Error('cancel');
          },
        }),
      },
    })),
  );
  expect(await checkDirectRoute('cu-stock')).toMatchObject({ reason: 'invalid-response' });
});

it.each([403, 429, 503])(
  'records only valid HTTP status in the route reason: %i',
  async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    expect(await checkDirectRoute('cu-stock')).toMatchObject({
      key: 'cu-stock',
      direct: false,
      reason: `http-${status}`,
    });
  },
);

it.each([99, 600, 403.5, Number.NaN])(
  'keeps invalid HTTP status out of the route reason: %s',
  async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, body: null }));
    expect(await checkDirectRoute('cu-stock')).toMatchObject({
      key: 'cu-stock',
      direct: false,
      reason: 'http-error',
    });
  },
);

it.each([
  ['missing', null, 'missing'],
  ['empty', '', 'invalid-or-unsafe'],
  ['relative', '/notice', 'same-origin'],
  ['absolute same origin', 'https://www.pocketcu.co.kr/notice', 'same-origin'],
  ['different origin', 'https://www.pocketcu.co.kr.example/notice', 'other-origin'],
  ['userinfo', 'https://user:password@www.pocketcu.co.kr/notice', 'invalid-or-unsafe'],
  ['empty userinfo', 'https://@www.pocketcu.co.kr/notice', 'invalid-or-unsafe'],
  ['plain HTTP', 'http://www.pocketcu.co.kr/notice', 'invalid-or-unsafe'],
  ['non HTTP scheme', 'javascript:alert(1)', 'invalid-or-unsafe'],
  ['absolute with excess slashes', 'https:////@www.pocketcu.co.kr/notice', 'invalid-or-unsafe'],
  ['relative with excess slashes', '///@www.pocketcu.co.kr/notice', 'invalid-or-unsafe'],
  ['combined location values', '/notice, https://other.invalid/', 'invalid-or-unsafe'],
  ['control character', '/notice\nsecret', 'invalid-or-unsafe'],
  ['C0 upper boundary', '/notice\u001f', 'invalid-or-unsafe'],
  ['C1 lower boundary', '/notice\u007f', 'invalid-or-unsafe'],
  ['C1 upper boundary', '/notice\u009f', 'invalid-or-unsafe'],
  ['normal ASCII boundary', '/notice\u0020', 'same-origin'],
  ['normal post-C1 boundary', '/notice\u00a0', 'same-origin'],
  ['backslash authority', 'https:\\@www.pocketcu.co.kr/notice', 'invalid-or-unsafe'],
  ['oversized', `/notice${'x'.repeat(2048)}`, 'invalid-or-unsafe'],
  ['invalid URL', 'https://[', 'invalid-or-unsafe'],
] as const)(
  'classifies only a fixed CU redirect value: %s',
  async (_label, location, resultClass) => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 302,
      headers: { get: () => location },
      body: { cancel: async () => undefined },
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await checkDirectRoute('cu-stock');
    expect(result).toMatchObject({
      direct: false,
      reason: 'http-302',
      cuRedirectLocation: resultClass,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      redirect: 'manual',
    });
    if (location) expect(JSON.stringify(result)).not.toContain(location);
  },
);

it.each(['cu-prime', 'cu-stock', 'cu-store'] as const)(
  'captures 302 only for the CU direct probe %s',
  async (key) => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 302,
      headers: { get: () => '/notice' },
      body: { cancel: async () => undefined },
    });
    vi.stubGlobal('fetch', fetcher);
    expect(await checkDirectRoute(key)).toMatchObject({
      key,
      direct: false,
      reason: 'http-302',
      cuRedirectLocation: 'same-origin',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it.each([
  ['non-CU route', 'seven-goods', 302],
  ['non-302 status', 'cu-stock', 301],
] as const)('does not add CU redirect metadata for %s', async (_label, key, status) => {
  const fetcher = vi.fn().mockResolvedValue({
    status,
    headers: { get: () => 'https://elsewhere.invalid/' },
    body: { cancel: async () => undefined },
  });
  vi.stubGlobal('fetch', fetcher);
  const result = await checkDirectRoute(key);
  expect(result).toMatchObject({ direct: false, reason: `http-${status}` });
  expect(result).not.toHaveProperty('cuRedirectLocation');
  expect(fetcher).toHaveBeenCalledOnce();
});

it('exposes only a fixed redirect class and ignores observer failure for a 302 response', async () => {
  const cancel = vi.fn(async () => undefined);
  const fetcher = vi.fn().mockResolvedValue({
    status: 302,
    headers: { get: () => '/notice?private=synthetic' },
    body: { cancel },
  });
  vi.stubGlobal('fetch', fetcher);
  const observer = vi.fn(() => {
    throw new Error('private observer detail');
  });
  await expect(
    boundedRouteJson(
      new URL('https://www.pocketcu.co.kr/api/search/rest/stock/main'),
      { method: 'POST' },
      1000,
      undefined,
      observer,
    ),
  ).rejects.toMatchObject({ status: 302 });
  expect(observer).toHaveBeenCalledExactlyOnceWith('same-origin');
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledOnce();
});

it('distinguishes its deadline from caller cancellation when fetch respects abort', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('native abort', 'AbortError')),
          );
        }),
    ),
  );
  const deadline = requestDirectRoute('cu-prime', {}, 10);
  const assertion = expect(deadline).rejects.toMatchObject({ reason: 'timeout' });
  await vi.advanceTimersByTimeAsync(10);
  await assertion;
});

it('records probe start time before a slow response completes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return Response.json({ resp_cd: '0000', areaCateList: [] });
    }),
  );
  const probe = checkDirectRoute('cu-prime');
  await vi.advanceTimersByTimeAsync(100);
  expect(await probe).toMatchObject({ direct: true, checkedAt: 1000 });
});
