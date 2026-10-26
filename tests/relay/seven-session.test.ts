import { afterEach, expect, it, vi } from 'vitest';
import { createSevenSessionTransport } from '../../scripts/relay/seven-session.js';
const url = 'https://new.7-elevenapp.co.kr/api/v1/open/search/goods';
const session = {
  cookie: 'public_session=test',
  userAgent: 'Browser',
  expiresAt: Date.now() + 600000,
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('정상 HTTP 요청에는 브라우저를 준비하지 않는다', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true }));
  const prepare = vi.fn();
  const client = createSevenSessionTransport({ fetcher, prepare, takeQuota: vi.fn() });
  expect((await client.fetch(url, { method: 'POST', body: '{}' })).status).toBe(200);
  expect(prepare).not.toHaveBeenCalled();
});
it('403이면 공개 세션을 한 번 준비한 뒤 별도 할당량으로 HTTP 재시도한다', async () => {
  const cancel = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 403 }))
    .mockResolvedValue(Response.json({ success: true }));
  const prepare = vi.fn().mockResolvedValue(session);
  const quota = vi.fn().mockResolvedValue(true);
  const client = createSevenSessionTransport({ fetcher, prepare, takeQuota: quota });
  expect((await client.fetch(url, { method: 'POST', body: '{}' })).status).toBe(200);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(quota).toHaveBeenCalledTimes(1);
  expect(new Headers(fetcher.mock.calls[1][1].headers).get('cookie')).toBe(session.cookie);
  expect(new Headers(fetcher.mock.calls[1][1].headers).get('user-agent')).toBe('Browser');
  await client.fetch(url, { method: 'POST', body: '{}' });
  expect(prepare).toHaveBeenCalledTimes(1);
});
it('동시 403은 같은 준비 작업을 공유하고 쿠키는 다른 원점에 보내지 않는다', async () => {
  let finish!: (s: typeof session) => void;
  const prepare = vi.fn(() => new Promise<typeof session>((resolve) => (finish = resolve)));
  const fetcher = vi
    .fn()
    .mockImplementation(async (_u, init) =>
      new Headers(init?.headers).has('cookie')
        ? Response.json({ success: true })
        : new Response(null, { status: 403 }),
    );
  const client = createSevenSessionTransport({
    fetcher,
    prepare,
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  const one = client.fetch(url);
  const two = client.fetch(url);
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  finish(session);
  await Promise.all([one, two]);
  await client.fetch('https://example.com/api/v1/open/search/goods');
  expect(fetcher.mock.calls.at(-1)?.[1]).toBeUndefined();
});
it('준비 실패와 반복 차단은 무한 준비하지 않으며 잘못된 세션도 거부한다', async () => {
  vi.useFakeTimers();
  const prepare = vi.fn().mockRejectedValue(new Error('private'));
  const fetcher = vi.fn().mockImplementation(async () => new Response(null, { status: 403 }));
  const client = createSevenSessionTransport({
    fetcher,
    prepare,
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  expect((await client.fetch(url)).status).toBe(403);
  expect((await client.fetch(url)).status).toBe(403);
  expect(prepare).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60001);
  prepare.mockResolvedValue({ ...session, cookie: 'x\r\nsecret' } as never);
  expect((await client.fetch(url)).status).toBe(403);
  expect(client.status().state).toBe('retry_wait');
});
it('재시도 할당량 거절이나 취소를 원본 성공으로 숨기지 않는다', async () => {
  const client = createSevenSessionTransport({
    fetcher: vi.fn().mockImplementation(async () => new Response(null, { status: 403 })),
    prepare: vi.fn().mockResolvedValue(session),
    takeQuota: vi.fn().mockResolvedValue(false),
  });
  await expect(client.fetch(url)).rejects.toMatchObject({ status: 429 });
  const controller = new AbortController();
  controller.abort();
  await expect(client.fetch(url, { signal: controller.signal })).rejects.toThrow();
});

it('기본 fetch와 허용되지 않은 Request·경로에는 쿠키를 주입하지 않는다', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  const client = createSevenSessionTransport({ prepare: vi.fn(), takeQuota: vi.fn() });
  expect(client.status().state).toBe('idle');
  const request = new Request(url);
  await client.fetch(request);
  expect(fetcher).toHaveBeenLastCalledWith(request, undefined);
  await client.fetch('https://new.7-elevenapp.co.kr/private');
  expect(fetcher).toHaveBeenLastCalledWith('https://new.7-elevenapp.co.kr/private', undefined);
});
it('준비 후에도 원본403이면 실패를 그대로 반환하고 준비를 반복하지 않는다', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(null, { status: 403 }));
  const prepare = vi.fn().mockResolvedValue(session);
  const client = createSevenSessionTransport({
    fetcher,
    prepare,
    takeQuota: vi.fn().mockResolvedValue(true),
    onEvent: () => {
      throw new Error('observer');
    },
  });
  expect((await client.fetch(url)).status).toBe(403);
  expect(client.status().state).toBe('ready');
  expect((await client.fetch(url)).status).toBe(403);
  expect(prepare).toHaveBeenCalledTimes(1);
});
it('동시 세션 준비 상태를 표시하고 만료된 쿠키는 다음 요청에서 제거한다', async () => {
  vi.useFakeTimers();
  let finish!: (s: typeof session) => void;
  const prepare = vi.fn(() => new Promise<typeof session>((r) => (finish = r)));
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockImplementation(async () => new Response(null, { status: 200 }));
  const client = createSevenSessionTransport({
    fetcher,
    prepare,
    takeQuota: vi.fn().mockResolvedValue(true),
  });
  const pending = client.fetch(url);
  await vi.waitFor(() => expect(prepare).toHaveBeenCalled());
  expect(client.status().state).toBe('preparing');
  finish({ ...session, expiresAt: Date.now() + 1000 });
  await pending;
  await vi.advanceTimersByTimeAsync(1001);
  await client.fetch(url);
  expect(new Headers(fetcher.mock.calls.at(-1)?.[1].headers).has('cookie')).toBe(false);
});
it.each(['minute', 'daily'] as const)('재시도 자체 %s 한도를 구분한다', async (blockedBy) => {
  const quota = Object.assign(vi.fn().mockResolvedValue(false), {
    status: () => ({ blockedBy, retryAfter: 12 }),
  });
  const client = createSevenSessionTransport({
    fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    prepare: vi.fn().mockResolvedValue(session),
    takeQuota: quota,
  });
  await expect(client.fetch(url)).rejects.toMatchObject({
    status: 429,
    quota: { quotaReason: blockedBy, retryAfter: 12 },
  });
});
it.each([
  { cookie: '' },
  { cookie: 'x'.repeat(16385) },
  { userAgent: '' },
  { userAgent: 'x'.repeat(513) },
  { userAgent: 'x\r\n' },
  { expiresAt: NaN },
  { expiresAt: 0 },
])('비정상 세션을 원문 노출 없이 거부한다', async (invalid) => {
  const client = createSevenSessionTransport({
    fetcher: vi.fn().mockImplementation(async () => new Response(null, { status: 403 })),
    prepare: vi.fn().mockResolvedValue({ ...session, ...invalid }),
    takeQuota: vi.fn(),
  });
  expect((await client.fetch(url)).status).toBe(403);
  expect(client.status().state).toBe('retry_wait');
});
