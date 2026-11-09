import { expect, it, vi } from 'vitest';
import { createJapanProductRelay } from '../../scripts/relay/daiso-jp.js';
const raw = { handle: '4550746075917', title: 'ボウル', price: 22000, available: true };
const req = (body: unknown, token = 'test-token') =>
  new Request('http://localhost/v1/dtryx/daiso-jp-product', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
it('인증된 고정 상품 JSON만 읽고 실제 상품 코드와 대조한다', async () => {
  const fetcher = vi.fn(async () => Response.json(raw));
  const takeQuota = vi.fn(async () => true);
  const handler = createJapanProductRelay('test-token', { fetcher, takeQuota });
  expect((await handler(req({ id: raw.handle }, 'wrong'))).status).toBe(401);
  for (const body of [
    null,
    [],
    {},
    { id: 1 },
    { id: '../x' },
    { id: raw.handle, url: 'https://other' },
  ])
    expect((await handler(req(body))).status).toBe(400);
  const response = await handler(req({ id: raw.handle }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(raw);
  expect(fetcher.mock.calls[0][0].toString()).toBe(
    'https://jp.daisonet.com/products/4550746075917.js',
  );
  expect(takeQuota).toHaveBeenCalledTimes(1);
});
it('원본 차단과 잘못된 상품을 실패로 유지한다', async () => {
  for (const response of [
    new Response('denied', { status: 403 }),
    new Response(null, { status: 403 }),
    Response.json({ ...raw, handle: '4550746075918' }),
  ]) {
    const handler = createJapanProductRelay('test-token', {
      takeQuota: async () => true,
      fetcher: vi.fn(async () => response),
    });
    expect((await handler(req({ id: raw.handle }))).status).toBe(502);
  }
});

it('원본 실패 본문의 회수 오류를 처리한다', async () => {
  const fetcher = vi.fn(
    async () =>
      ({
        status: 403,
        body: {
          cancel: async () => {
            throw Error('cancel failed');
          },
        },
      }) as unknown as Response,
  );
  const handler = createJapanProductRelay('test-token', { takeQuota: async () => true, fetcher });
  expect((await handler(req({ id: raw.handle }))).status).toBe(502);
});

it('원본429 뒤 Retry-After 동안 다른 상품과 캐시 우회도 원본을 반복하지 않는다', async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '120' } }))
      .mockResolvedValue(Response.json(raw));
    const handler = createJapanProductRelay('test-token', { takeQuota: async () => true, fetcher });
    expect((await handler(req({ id: raw.handle }))).headers.get('x-relay-upstream-status')).toBe(
      '429',
    );
    const bypass = req({ id: '4550746075918' });
    bypass.headers.set('x-relay-cache-bypass', 'true');
    expect((await handler(bypass)).status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 120001);
    expect((await handler(req({ id: raw.handle }))).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
it('원본429에 대기 안내가 없으면1분 후 원본을 재검증한다', async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    const handler = createJapanProductRelay('test-token', { takeQuota: async () => true, fetcher });
    await handler(req({ id: raw.handle }));
    await handler(req({ id: raw.handle }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 60001);
    await handler(req({ id: raw.handle }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it('원본429 대기는 표준 헤더로 제공하고 자체 분당 제한은 구분한다', async () => {
  vi.useFakeTimers();
  try {
    const handler = createJapanProductRelay('test-token', {
      takeQuota: async () => true,
      fetcher: async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } }),
    });
    for (let i = 0; i < 2; i++) {
      const r = await handler(req({ id: raw.handle }));
      expect(r.status).toBe(429);
      expect(r.headers.get('Retry-After')).toBe('120');
      expect(r.headers.get('x-relay-quota-reason')).toBeNull();
    }
    const own = createJapanProductRelay('test-token', {
      takeQuota: Object.assign(async () => false, {
        status: () => ({ blockedBy: 'minute' as const, retryAfter: 7 }),
      }),
    });
    const r = await own(req({ id: raw.handle }));
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('7');
    expect(r.headers.get('x-relay-quota-reason')).toBe('minute');
  } finally {
    vi.useRealTimers();
  }
});

it('서로 다른 상품이 동시에 들어와도 첫 원본429 뒤 추가 원본 요청을 시작하지 않는다', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const handler = createJapanProductRelay('test-token', { takeQuota: async () => true, fetcher });
  const first = handler(req({ id: raw.handle }));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const second = handler(req({ id: '4550746075918' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(fetcher).toHaveBeenCalledTimes(1);
  finish(new Response(null, { status: 429, headers: { 'Retry-After': '60' } }));
  expect((await first).status).toBe(429);
  expect((await second).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('대기 취소가 앞 원본을 취소하거나 뒤 요청을 먼저 시작시키지 않는다', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(Response.json({ ...raw, handle: '4550746075919' }));
  const handler = createJapanProductRelay('test-token', { takeQuota: async () => true, fetcher });
  const first = handler(req({ id: raw.handle }));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const controller = new AbortController();
  const second = handler(new Request(req({ id: '4550746075918' }), { signal: controller.signal }));
  controller.abort();
  expect((await second).status).toBe(499);
  const third = handler(req({ id: '4550746075919' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(fetcher).toHaveBeenCalledTimes(1);
  finish(Response.json(raw));
  expect((await first).status).toBe(200);
  expect((await third).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('검색 중계는 고정 공식 검색 경로만 허용하고 상세429와 독립적으로 원본 대기를 지킨다', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(
    new URL('../services/daisoJp/fixtures/products.html', import.meta.url),
    'utf8',
  );
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValue(new Response(html));
  const handler = createJapanProductRelay('test-token', { takeQuota: async () => true, fetcher });
  expect((await handler(req({ id: raw.handle }))).status).toBe(429);
  const searchRequest = (body: unknown) =>
    new Request('http://localhost/v1/dtryx/daiso-jp-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: JSON.stringify(body),
    });
  for (const body of [
    {},
    { query: '', page: 1 },
    { query: 'a', page: 0 },
    { query: 'a', page: 1, url: 'https://other' },
  ])
    expect((await handler(searchRequest(body))).status).toBe(400);
  const response = await handler(searchRequest({ query: 'ボウル', page: 2 }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ html });
  const url = new URL(fetcher.mock.calls[1][0]);
  expect(url.origin + url.pathname).toBe('https://jp.daisonet.com/search');
  expect(url.searchParams.get('q')).toBe('ボウル');
  expect(url.searchParams.get('page')).toBe('2');
});

it('검색 원본429도 전체 검색 대기를 공유하고 응답 형식 오류는 빈 결과가 되지 않는다', async () => {
  const make = (query: string) =>
    new Request('http://localhost/v1/dtryx/daiso-jp-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: JSON.stringify({ query, page: 1 }),
    });
  const fetcher = vi.fn(
    async () => new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
  );
  const handler = createJapanProductRelay('test-token', { takeQuota: async () => true, fetcher });
  const first = await handler(make('a'));
  expect(first.status).toBe(429);
  expect(Number(first.headers.get('Retry-After'))).toBeGreaterThan(100);
  expect((await handler(make('b'))).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const invalid = createJapanProductRelay('test-token', {
    takeQuota: async () => true,
    fetcher: async () => new Response('<html>login</html>'),
  });
  expect((await invalid(make('a'))).status).toBe(502);
});
