import { afterEach, expect, it, vi } from 'vitest';
import { createEmart24SessionTransport } from '../../scripts/relay/emart24-session.js';
import { createConvenienceRelay } from '../../scripts/relay/convenience.js';

const origin = 'https://everse.emart24.co.kr';
const url = origin + '/stock/stock/search';
const warm = () =>
  new Response('page', {
    headers: { 'Set-Cookie': 'JSESSIONID=session_1; Path=/; Secure; HttpOnly' },
  });
const make = (fetcher: typeof fetch, takeQuota = vi.fn(async () => true)) =>
  createEmart24SessionTransport({ fetcher, takeQuota });
it('세션 복구의 실제 중계 경계에서도 로컬 한도와 재시도 시간을 보존한다', async () => {
  const takeQuota = Object.assign(vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false), {
    status: () => ({ blockedBy: 'minute', retryAfter: 60 }),
  });
  const transport = createEmart24SessionTransport({
    takeQuota: takeQuota as never,
    fetcher: vi.fn(async () => new Response('', { status: 403 })),
  });
  const relay = createConvenienceRelay('token', {
    takeQuota: takeQuota as never,
    fetcher: transport.fetch,
  });
  const response = await relay(
    new Request('http://localhost/v1/convenience/emart24-products', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({
        currentPage: '1',
        pageCnt: '1',
        sortType: 'SALE',
        saleProductYn: 'N',
        searchWord: '커피',
      }),
    }),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get('x-relay-quota-reason')).toBe('minute');
  expect(response.headers.get('Retry-After')).toBe('60');
});
it('세션 발급이 실패해도 원래 403의 스트림을 회수한다', async () => {
  const blocked = new Response('blocked', { status: 403 });
  const cancel = vi.spyOn(blocked.body!, 'cancel');
  const fetcher = vi.fn().mockResolvedValueOnce(blocked).mockRejectedValue(new Error('offline'));
  await expect(make(fetcher).fetch(url)).rejects.toThrow('offline');
  expect(cancel).toHaveBeenCalledOnce();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('기본 fetch를 사용하며 호출자의 사용자 세션을 요구하지 않는다', async () => {
  const fetcher = vi.fn(async () => Response.json({}));
  vi.stubGlobal('fetch', fetcher);
  await createEmart24SessionTransport({ takeQuota: async () => true }).fetch(url);
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each(['minute', 'daily', 'none'])('추가 호출 한도 사유를 보존한다: %s', async (blockedBy) => {
  const quota = Object.assign(
    vi.fn(async () => false),
    { status: () => ({ blockedBy, retryAfter: 60 }) },
  );
  const x = createEmart24SessionTransport({
    fetcher: vi.fn(async () => new Response('', { status: 403 })),
    takeQuota: quota as never,
  });
  await expect(x.fetch(url)).rejects.toMatchObject({
    status: 429,
    ...(blockedBy === 'none' ? {} : { quota: { quotaReason: blockedBy, retryAfter: 60 } }),
  });
});

it('403 후 공식 화면의 새 세션으로 한 번 재시도하고 다음 조회에 재사용한다', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 403 }))
    .mockResolvedValueOnce(warm())
    .mockResolvedValue(Response.json({ totalCnt: 1 }));
  const quota = vi.fn(async () => true);
  const x = make(fetcher, quota);
  expect((await x.fetch(url, { method: 'POST', body: 'searchWord=coffee' })).status).toBe(200);
  expect(quota).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toBe(url);
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'GET', redirect: 'manual' });
  expect(new Headers(fetcher.mock.calls[2][1].headers).get('Cookie')).toBe('JSESSIONID=session_1');
  expect(fetcher.mock.calls[2][1]).toMatchObject({ method: 'POST', body: 'searchWord=coffee' });
  await x.fetch(origin + '/api/stock/v3/stock-search/store');
  expect(new Headers(fetcher.mock.calls[3][1].headers).get('Cookie')).toBe('JSESSIONID=session_1');
});
it('정상 HTTP와 다른 출처 및 Request 입력은 재시도하지 않는다', async () => {
  const fetcher = vi.fn(async () => new Response('{}'));
  const x = make(fetcher);
  for (const input of [
    url,
    'https://example.com/stock/stock/search',
    origin + '/other',
    new Request(url),
  ])
    await x.fetch(input);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it.each([401, 429, 500])('403 이외 오류 %s를 세션 문제로 바꾸지 않는다', async (status) => {
  const fetcher = vi.fn(async () => new Response('', { status }));
  expect((await make(fetcher).fetch(url)).status).toBe(status);
  expect(fetcher).toHaveBeenCalledOnce();
});
it('추가 요청 한도가 없으면 원본을 더 호출하지 않고 429를 보존한다', async () => {
  const fetcher = vi.fn(async () => new Response('', { status: 403 }));
  await expect(
    make(
      fetcher,
      vi.fn(async () => false),
    ).fetch(url),
  ).rejects.toMatchObject({ status: 429 });
  expect(fetcher).toHaveBeenCalledOnce();
});
it('취소된 요청은 세션 발급을 시작하지 않는다', async () => {
  const fetcher = vi.fn();
  await expect(make(fetcher).fetch(url, { signal: AbortSignal.abort() })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  new Response('', { status: 302 }),
  new Response('no cookie'),
  new Response('', { headers: { 'Set-Cookie': 'JSESSIONID=; Path=/' } }),
])('유효한 새 세션을 받지 못하면 원본 차단을 그대로 반환한다', async (page) => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 403 }))
    .mockResolvedValue(page);
  expect((await make(fetcher).fetch(url)).status).toBe(403);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('새 세션으로도 실패하면 무한 재시도하지 않는다', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 403 }))
    .mockResolvedValueOnce(warm())
    .mockResolvedValue(new Response('', { status: 403 }));
  expect((await make(fetcher).fetch(url)).status).toBe(403);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('세션을 10분 넘게 보관하지 않는다', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 403 }))
    .mockResolvedValueOnce(warm())
    .mockImplementation(async () => Response.json({}));
  const x = make(fetcher);
  await x.fetch(url);
  vi.advanceTimersByTime(600001);
  await x.fetch(url);
  expect(new Headers(fetcher.mock.calls[3][1]?.headers).has('Cookie')).toBe(false);
});
