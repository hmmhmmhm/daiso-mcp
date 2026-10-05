import { afterEach, expect, it, vi } from 'vitest';
import { fetchJson } from '../../src/utils/http.js';
import { requestConvenienceRelay } from '../../src/utils/convenienceTransport.js';
import { fetchEmart24Stores } from '../../src/services/emart24/client.js';
const relay = { convenienceRelayUrl: 'https://relay.example', convenienceRelayToken: 'token' };
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([502, 503, 504])('GS 읽기는 HTTP %i 후 한 번만 새 릴레이 요청을 보낸다', async (status) => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status }))
    .mockResolvedValueOnce(Response.json({ stores: [] }));
  vi.stubGlobal('fetch', fetcher);
  const result = requestConvenienceRelay('gs25-stock', { keyword: '강남' }, relay);
  await vi.advanceTimersByTimeAsync(250);
  expect(await result).toEqual({ stores: [] });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});

it.each([401, 403, 429, 400, 500])('GS HTTP %i는 재시도하지 않는다', async (status) => {
  const fetcher = vi.fn(
    async () =>
      new Response('', {
        status,
        headers: { 'x-relay-quota-reason': 'daily', 'retry-after': '86400' },
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  await expect(requestConvenienceRelay('gs25-stock', {}, relay)).rejects.toMatchObject({
    upstreamStatus: status,
  });
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(['cu-prime', 'seven-stock', 'gs25-write', 'unknown'])(
  '%s 작업은 재시도 허용 목록 밖이다',
  async (operation) => {
    const fetcher = vi.fn(async () => new Response('', { status: 502 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(requestConvenienceRelay(operation, {}, relay)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it.each(['{broken', '{"success":false}'])('GS 잘못된 본문 %s는 재시도하지 않는다', async (body) => {
  const fetcher = vi.fn(async () => new Response(body));
  vi.stubGlobal('fetch', fetcher);
  await expect(requestConvenienceRelay('gs25-stock', {}, relay)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});

it('GS 연결 실패는 한 번만 재시도한다', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('network'))
    .mockResolvedValueOnce(Response.json({ stores: [] }));
  vi.stubGlobal('fetch', fetcher);
  const result = requestConvenienceRelay('gs25-products', {}, relay);
  await vi.advanceTimersByTimeAsync(250);
  expect(await result).toEqual({ stores: [] });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('GS Retry-After가 남은 예산보다 길면 즉시 실패한다', async () => {
  const fetcher = vi.fn(
    async () => new Response('', { status: 503, headers: { 'retry-after': '60' } }),
  );
  vi.stubGlobal('fetch', fetcher);
  await expect(requestConvenienceRelay('gs25-stock', {}, relay)).rejects.toMatchObject({
    upstreamStatus: 503,
  });
  expect(fetcher).toHaveBeenCalledOnce();
});

it('이마트24 공개 매장 읽기는 403을 한 번 재시도한다', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 403 }))
    .mockResolvedValueOnce(Response.json({ error: 0, count: 0, data: [] }));
  vi.stubGlobal('fetch', fetcher);
  const result = fetchEmart24Stores({ keyword: '강남' });
  await vi.advanceTimersByTimeAsync(250);
  expect((await result).stores).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('이마트24 첫 제한 시간 이후 15초 안에 두 번째 읽기를 완료한다', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockImplementationOnce(async (_url, init) => {
      await new Promise<void>((resolve) => init.signal.addEventListener('abort', () => resolve()));
      throw new DOMException('aborted', 'AbortError');
    })
    .mockResolvedValueOnce(Response.json({ error: 0, count: 0, data: [] }));
  vi.stubGlobal('fetch', fetcher);
  const result = fetchEmart24Stores({ keyword: '강남' });
  let settled = false;
  const observed = result.then((value) => {
    settled = true;
    return value;
  });
  await vi.advanceTimersByTimeAsync(15000);
  expect(settled).toBe(true);
  await observed;
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('공유 HTTP 전체 예산은 다음 시도의 제한 시간을 남은 시간으로 줄인다', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async (_url, init) => {
    await new Promise<void>((resolve) => init.signal.addEventListener('abort', () => resolve()));
    throw new DOMException('aborted', 'AbortError');
  });
  vi.stubGlobal('fetch', fetcher);
  const result = fetchJson('https://example.com', {
    timeout: 7000,
    totalTimeout: 10000,
    retries: 1,
  });
  const observed = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(10000);
  await observed;
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('호출자 취소는 재시도 없이 원래 이유로 실패한다', async () => {
  const caller = new AbortController();
  caller.abort(new Error('caller cancelled'));
  const fetcher = vi.fn();
  await expect(
    fetchJson('https://example.com', { fetchImpl: fetcher, signal: caller.signal, retries: 1 }),
  ).rejects.toThrow('caller cancelled');
  expect(fetcher).not.toHaveBeenCalled();
});

it('GS 입력 직렬화 실패는 재시도하지 않는다', async () => {
  vi.useFakeTimers();
  const body: { self?: unknown } = {};
  body.self = body;
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const result = requestConvenienceRelay('gs25-stock', body, relay);
  let settled = false;
  const observed = result.catch((error) => {
    settled = true;
    expect(error.message).toContain('실패');
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(true);
  await observed;
  expect(vi.getTimerCount()).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
});

it('GS 멈춘 연결은 두 번 시도해도 전체 15초를 넘기지 않는다', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async (_url, init) => {
    await new Promise<void>((resolve) => init.signal.addEventListener('abort', () => resolve()));
    throw new DOMException('aborted', 'AbortError');
  });
  vi.stubGlobal('fetch', fetcher);
  const result = requestConvenienceRelay('gs25-stock', {}, relay, 20000);
  const observed = expect(result).rejects.toMatchObject({ code: 'CONVENIENCE_RELAY_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(15000);
  await observed;
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([401, 429])('이마트24 HTTP %i는 재시도하지 않는다', async (status) => {
  const fetcher = vi.fn(async () => new Response('', { status }));
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchEmart24Stores()).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledOnce();
});

it('공유 HTTP 기본 정책은 403을 재시도하지 않는다', async () => {
  const fetcher = vi.fn(async () => new Response('', { status: 403 }));
  await expect(
    fetchJson('https://example.com', { fetchImpl: fetcher, retries: 1 }),
  ).rejects.toMatchObject({ status: 403 });
  expect(fetcher).toHaveBeenCalledOnce();
});

it('공유 HTTP 전체 예산보다 긴 Retry-After는 대기하지 않는다', async () => {
  const fetcher = vi.fn(
    async () => new Response('busy', { status: 503, headers: { 'retry-after': '60' } }),
  );
  await expect(
    fetchJson('https://example.com', { fetchImpl: fetcher, totalTimeout: 15000, retries: 1 }),
  ).rejects.toMatchObject({ status: 503 });
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(['fetch', 'backoff'])('호출자 취소는 %s 중에도 원래 이유를 보존한다', async (stage) => {
  vi.useFakeTimers();
  const caller = new AbortController();
  const fetcher = vi.fn(async (_url, init) => {
    if (stage === 'backoff') return new Response('', { status: 503 });
    await new Promise<void>((resolve) => init.signal.addEventListener('abort', () => resolve()));
    throw new DOMException('aborted', 'AbortError');
  });
  const result = fetchJson('https://example.com', {
    fetchImpl: fetcher,
    signal: caller.signal,
    retries: 1,
  });
  const observed = expect(result).rejects.toThrow('caller cancelled');
  await vi.advanceTimersByTimeAsync(0);
  caller.abort(new Error('caller cancelled'));
  await observed;
  expect(fetcher).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('GS 성공 헤더 뒤 본문 제한 시간은 재시도하지 않는다', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(
    async (_url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init.signal.addEventListener('abort', () =>
              controller.error(new DOMException('aborted', 'AbortError')),
            );
          },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  const result = requestConvenienceRelay('gs25-stock', {}, relay);
  const observed = expect(result).rejects.toMatchObject({ code: 'CONVENIENCE_RELAY_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(15000);
  await observed;
  expect(fetcher).toHaveBeenCalledOnce();
});

it('GS 예산이 이미 소진되면 새 릴레이 요청을 보내지 않는다', async () => {
  const fetcher = vi.fn(async () => Response.json({ stores: [] }));
  vi.stubGlobal('fetch', fetcher);
  await expect(requestConvenienceRelay('gs25-stock', {}, relay, 0)).rejects.toMatchObject({
    code: 'CONVENIENCE_RELAY_TIMEOUT',
  });
  expect(fetcher).not.toHaveBeenCalled();
});

it('공유 HTTP 소진된 전체 예산은 fetch 전에 실패한다', async () => {
  const fetcher = vi.fn();
  await expect(
    fetchJson('https://example.com', { fetchImpl: fetcher, totalTimeout: 0 }),
  ).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('호출자 신호가 있어도 정상 재시도 대기를 완료할 수 있다', async () => {
  vi.useFakeTimers();
  const caller = new AbortController();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ready: true }));
  const result = fetchJson('https://example.com', {
    fetchImpl: fetcher,
    signal: caller.signal,
    retries: 1,
  });
  await vi.advanceTimersByTimeAsync(250);
  expect(await result).toEqual({ ready: true });
  expect(vi.getTimerCount()).toBe(0);
});

it('공유 HTTP 정확한 성공 상태 요구는 다른 2xx를 거절한다', async () => {
  await expect(
    fetchJson('https://example.com', {
      fetchImpl: async () => Response.json({ stores: [] }, { status: 201 }),
      expectedStatus: 200,
    }),
  ).rejects.toMatchObject({ status: 201 });
});


it('이마트24 여러 키워드 변형도 하나의 15초 예산을 공유한다', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementationOnce(async () => {
    await new Promise(resolve => setTimeout(resolve, 6000));
    return Response.json({ error: 1 });
  }).mockImplementation(async (_url, init) => {
    await new Promise<void>(resolve => init.signal.addEventListener('abort', () => resolve()));
    throw new DOMException('aborted', 'AbortError');
  });
  vi.stubGlobal('fetch', fetcher);
  let settled = false;
  const result = fetchEmart24Stores({ keyword: '강남 역' }).finally(() => { settled = true; });
  const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(14999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expect(settled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('search')))
    .toEqual(['강남 역', '강남역', '강남역']);
});
