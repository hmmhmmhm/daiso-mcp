import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ start: vi.fn(), evaluate: vi.fn(), close: vi.fn() }));
vi.mock('../../scripts/relay/safari-lifecycle.js', () => ({ createSafariLifecycle: () => mock }));
import { createSevenSafariTransport, browserFetch } from '../../scripts/relay/seven-safari.js';
const url = 'https://new.7-elevenapp.co.kr/api/v1/open/search/goods';
beforeEach(() => {
  vi.clearAllMocks();
  mock.start.mockResolvedValue(undefined);
  mock.close.mockResolvedValue(undefined);
  mock.evaluate.mockResolvedValue({ status: 200, text: '{"success":true}' });
});
it('정상 HTTP는 브라우저를 사용하지 않는다', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  const x = createSevenSafariTransport('/state', { fetcher, takeQuota: vi.fn() });
  expect((await x.fetch(url)).status).toBe(200);
  expect(mock.start).not.toHaveBeenCalled();
  expect(x.status().state).toBe('idle');
});
it('세븐 외부와 Request 입력을 변경하지 않는다', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  const x = createSevenSafariTransport('/state', { fetcher, takeQuota: vi.fn() });
  await x.fetch('https://example.com');
  await x.fetch(new Request(url));
  expect(mock.start).not.toHaveBeenCalled();
});
it('403만 Safari 동일 출처에서 재시도하고 쿠키를 내보내지 않는다', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('blocked', { status: 403 }));
  const quota = vi.fn().mockResolvedValue(true);
  const x = createSevenSafariTransport('/state', { fetcher, takeQuota: quota });
  const r = await x.fetch(url, { method: 'POST', body: '{}' });
  expect(await r.json()).toEqual({ success: true });
  expect(quota).toHaveBeenCalledOnce();
  expect(mock.close).toHaveBeenCalledOnce();
  expect(mock.evaluate.mock.calls[0][1]).toMatchObject({
    origin: 'https://new.7-elevenapp.co.kr',
    path: '/api/v1/open/search/goods',
    method: 'POST',
    body: '{}',
  });
  expect(x.status().state).toBe('ready');
});
it('추가 원본 한도 없이 Safari 재시도를 하지 않는다', async () => {
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    takeQuota: vi.fn().mockResolvedValue(false),
  });
  await expect(x.fetch(url)).rejects.toMatchObject({ status: 429 });
  expect(mock.start).not.toHaveBeenCalled();
});
it('취소된 요청을 시작하지 않는다', async () => {
  const signal = AbortSignal.abort();
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  await expect(x.fetch(url, { signal })).rejects.toThrow();
  expect(mock.start).not.toHaveBeenCalled();
});
it('Safari 실패를 품절로 숨기거나 Chrome으로 우회하지 않는다', async () => {
  mock.evaluate.mockRejectedValue(new Error('failed'));
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  await expect(x.fetch(url)).rejects.toThrow();
  expect(mock.close).toHaveBeenCalledOnce();
  expect(x.status().state).toBe('failed');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([204, 403])('Safari 원본 HTTP 상태를 보존한다: %s', async (status) => {
  mock.evaluate.mockResolvedValue({ status, text: '' });
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  const response = await x.fetch(url);
  expect(response.status).toBe(status);
});
it.each(['minute', 'daily', 'none'])('자체 한도 이유를 보존한다: %s', async (blockedBy) => {
  const quota = Object.assign(vi.fn().mockResolvedValue(false), {
    status: () => ({ blockedBy, retryAfter: 60 }),
  });
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    takeQuota: quota as never,
  });
  await expect(x.fetch(url)).rejects.toMatchObject({ status: 429 });
});
it('원본 요청 중 취소되면 활성 helper를 정리한다', async () => {
  const signal = new AbortController();
  mock.evaluate.mockImplementation(async () => {
    signal.abort();
    return { status: 200, text: '{}' };
  });
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  await x.fetch(url, { signal: signal.signal });
  expect(mock.close).toHaveBeenCalledTimes(2);
});
it('문자열이 아닌 본문을 조용히 바꾸지 않는다', async () => {
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  await expect(x.fetch(url, { method: 'POST', body: new Uint8Array([1]) })).rejects.toThrow(
    'JSON body',
  );
});
it('브라우저 내부 fetch가 고정 원점·제한·메서드를 사용한다', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{"success":true}'));
  vi.stubGlobal('fetch', fetcher);
  expect(
    await browserFetch({
      origin: 'https://new.7-elevenapp.co.kr',
      path: '/api/v1/open/search/goods',
      method: 'POST',
      body: '{}',
    }),
  ).toMatchObject({ status: 200, text: '{"success":true}' });
  expect(fetcher).toHaveBeenCalledWith(
    url,
    expect.objectContaining({ credentials: 'include', redirect: 'error' }),
  );
});
it('브라우저 내부 빈 본문을 처리한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  expect(
    await browserFetch({
      origin: 'https://new.7-elevenapp.co.kr',
      path: '/',
      method: 'GET',
      body: null,
    }),
  ).toMatchObject({ status: 204, text: '' });
});
it('2MiB 초과 스트림을 중단한다', async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
          },
          cancel,
        }),
      ),
    ),
  );
  await expect(
    browserFetch({ origin: 'https://new.7-elevenapp.co.kr', path: '/', method: 'GET', body: null }),
  ).rejects.toThrow('response-size');
  expect(cancel).toHaveBeenCalledOnce();
});

it('기본 HTTP fetch를 사용하고 60초 복구 대기를 유지한다', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(null, { status: 403 }));
  vi.stubGlobal('fetch', fetcher);
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  mock.evaluate.mockResolvedValue({ status: 429, text: '{}', retryAfter: '60' });
  const x = createSevenSafariTransport('/state', { takeQuota: vi.fn().mockResolvedValue(true) });
  expect((await x.fetch(url)).headers.get('Retry-After')).toBe('60');
  await x.fetch(url);
  expect(mock.start).toHaveBeenCalledOnce();
  now.mockReturnValue(61000);
  await x.fetch(url);
  expect(mock.start).toHaveBeenCalledTimes(2);
});
it('브라우저 fetch의 거절 객체를 빈 HTTP200으로 바꾸지 않는다', async () => {
  mock.evaluate.mockResolvedValue({ reason: 'network', body: null });
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockImplementation(async () => new Response('', { status: 403 })),
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  await expect(x.fetch(url)).rejects.toThrow();
  expect(x.status().state).toBe('failed');
});
it('한도 대기 중 취소된 요청은 Safari를 열지 않는다', async () => {
  const controller = new AbortController();
  const quota = vi.fn().mockImplementation(async () => {
    controller.abort();
    return true;
  });
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockImplementation(async () => new Response('', { status: 403 })),
    takeQuota: quota,
  });
  await expect(x.fetch(url, { signal: controller.signal })).rejects.toThrow();
  expect(mock.start).not.toHaveBeenCalled();
});
it('이미 대기열에 있던 요청도 새 실패 대기를 지킨다', async () => {
  let release: (value: unknown) => void = () => {};
  mock.evaluate.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const quota = vi.fn().mockResolvedValue(true);
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockImplementation(async () => new Response('blocked', { status: 403 })),
    takeQuota: quota,
  });
  const a = x.fetch(url);
  const b = x.fetch(url);
  await vi.waitFor(() => expect(mock.evaluate).toHaveBeenCalledOnce());
  mock.evaluate.mockResolvedValue({ status: 403, text: 'blocked' });
  release({ status: 403, text: 'blocked' });
  await a;
  const second = await b;
  expect(await second.text()).toBe('blocked');
  expect(quota).toHaveBeenCalledTimes(1);
});

it.each([
  null,
  {},
  { status: NaN, text: '' },
  { status: 199, text: '' },
  { status: 600, text: '' },
  { status: 200, text: null },
  { status: 200, text: '', reason: 'network' },
])('잘못된 Safari 결과를 거절한다 %j', async (value) => {
  mock.evaluate.mockResolvedValue(value);
  const x = createSevenSafariTransport('/state', {
    fetcher: vi.fn().mockImplementation(async () => new Response('', { status: 403 })),
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  await expect(x.fetch(url)).rejects.toThrow('Invalid Safari response');
});
