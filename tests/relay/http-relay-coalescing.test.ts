import { afterEach, expect, it, vi } from 'vitest';
import { createHttpRelay, RelayError } from '../../scripts/relay/http-relay.js';
const request = (
  body: unknown = { item: 'cola', lat: 37 },
  signal?: AbortSignal,
  token = 'token',
) =>
  new Request('http://localhost/test/stock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });
function setup(cache = true) {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const gate = new Promise<unknown>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  const upstream = vi.fn(async (_op, _params, _signal) => gate);
  const takeQuota = vi.fn(async () => true);
  const relay = createHttpRelay('token', {
    prefix: '/test/',
    operations: ['stock'],
    cacheTtl: cache ? () => 30000 : undefined,
    validate: (v) => {
      if (!v || typeof v !== 'object') throw new RelayError(400);
      return v;
    },
    upstream,
    takeQuota,
  });
  return { relay, upstream, takeQuota, resolve, reject };
}
afterEach(() => vi.useRealTimers());
it('동일20개 최초 조회는 원본과 예산을 각각1회 사용하고 body를 분리한다', async () => {
  const s = setup();
  const pending = Array.from({ length: 20 }, () => s.relay(request()));
  await vi.waitFor(() => expect(s.upstream).toHaveBeenCalled());
  s.resolve({ quantity: 7 });
  const results = await Promise.all(pending);
  expect(s.upstream).toHaveBeenCalledTimes(1);
  expect(s.takeQuota).toHaveBeenCalledTimes(1);
  expect(await Promise.all(results.map((r) => r.json()))).toEqual(Array(20).fill({ quantity: 7 }));
});
it.each(['leader', 'follower'])(
  '개별 %s 취소는 다른 대기자 원본을 취소하지 않는다',
  async (who) => {
    const s = setup();
    const c = new AbortController();
    const first = s.relay(request(undefined, who === 'leader' ? c.signal : undefined));
    await vi.waitFor(() => expect(s.upstream).toHaveBeenCalledTimes(1));
    const second = s.relay(request(undefined, who === 'follower' ? c.signal : undefined));
    await new Promise((r) => setTimeout(r, 10));
    c.abort();
    const canceled = who === 'leader' ? first : second;
    expect((await canceled).status).toBe(499);
    expect(s.upstream.mock.calls[0][2].aborted).toBe(false);
    s.resolve({ quantity: 0 });
    expect((await (who === 'leader' ? second : first)).status).toBe(200);
    expect(s.upstream).toHaveBeenCalledTimes(1);
  },
);
it('모든 대기자가 취소하면 작업을 중단하고 새 조회는 별도 작업으로 시작한다', async () => {
  const s = setup();
  const a = new AbortController();
  const b = new AbortController();
  const p = s.relay(request(undefined, a.signal));
  const q = s.relay(request(undefined, b.signal));
  await vi.waitFor(() => expect(s.upstream).toHaveBeenCalled());
  a.abort();
  b.abort();
  await Promise.all([p, q]);
  expect(s.upstream.mock.calls[0][2].aborted).toBe(true);
  const fresh = s.relay(request());
  await vi.waitFor(() => expect(s.upstream).toHaveBeenCalledTimes(2));
  s.resolve({ quantity: 9 });
  expect((await fresh).status).toBe(200);
  expect(await (await s.relay(request())).json()).toEqual({ quantity: 9 });
});
it('실패를 함께 반환하지만 캐시하지 않고 다음 요청은 다시 조회한다', async () => {
  const s = setup();
  const a = s.relay(request());
  const b = s.relay(request());
  await vi.waitFor(() => expect(s.upstream).toHaveBeenCalled());
  s.reject(new RelayError(403));
  expect((await a).status).toBe(403);
  expect((await b).status).toBe(403);
  s.upstream.mockResolvedValue({ quantity: 7 });
  expect((await s.relay(request())).status).toBe(200);
  expect(s.upstream).toHaveBeenCalledTimes(2);
});
it('같은 키여도 캐시 미설정 작업은 공유하지 않는다', async () => {
  const s = setup(false);
  const a = s.relay(request());
  const b = s.relay(request());
  await vi.waitFor(() => expect(s.upstream).toHaveBeenCalledTimes(2));
  s.resolve({});
  await Promise.all([a, b]);
});
it('상품·지역이 다르면 별도로 조회하며 검증 실패 요청은 공유하지 않는다', async () => {
  const s = setup();
  const valid = [
    s.relay(request()),
    s.relay(request({ item: 'coffee', lat: 37 })),
    s.relay(request({ item: 'cola', lat: 38 })),
  ];
  expect((await s.relay(request(null))).status).toBe(400);
  expect((await s.relay(request(undefined, undefined, 'wrong'))).status).toBe(401);
  s.resolve({});
  await Promise.all(valid);
  expect(s.upstream).toHaveBeenCalledTimes(3);
});
it('100개 동시 요청에도32접수 상한을 유지하고 접수 조회는 원본1회이다', async () => {
  const s = setup();
  const p = Array.from({ length: 100 }, () => s.relay(request()));
  await vi.waitFor(() => expect(s.upstream).toHaveBeenCalled());
  s.resolve({});
  const results = await Promise.all(p);
  expect(results.filter((r) => r.status === 200)).toHaveLength(32);
  expect(results.filter((r) => r.status === 503)).toHaveLength(68);
  expect(s.upstream).toHaveBeenCalledTimes(1);
});
it('뒤늦게 합류한 요청도 공유 작업15초 기한 후504를 받고 슬롯이 회수된다', async () => {
  vi.useFakeTimers();
  const s = setup();
  const a = s.relay(request());
  await vi.advanceTimersByTimeAsync(1000);
  const b = s.relay(request());
  await vi.advanceTimersByTimeAsync(14000);
  expect((await a).status).toBe(504);
  expect((await b).status).toBe(504);
  s.upstream.mockResolvedValue({ quantity: 1 });
  const fresh = s.relay(request());
  await vi.advanceTimersByTimeAsync(0);
  expect((await fresh).status).toBe(200);
});
it('미정의 원본 응답은 오류이며 성공 캐시에 저장하지 않는다', async () => {
  const s = setup();
  const p = s.relay(request());
  s.resolve(undefined);
  expect((await p).status).toBe(502);
  s.upstream.mockResolvedValue({ quantity: 0 });
  expect((await s.relay(request())).status).toBe(200);
  expect(s.upstream).toHaveBeenCalledTimes(2);
});
it('공유 요청도 각 request ID와 coalesced 단계를 기록한다', async () => {
  let finish!: (data: unknown) => void;
  const gate = new Promise((ok) => {
    finish = ok;
  });
  const onEvent = vi.fn();
  const handler = createHttpRelay('token', {
    prefix: '/test/',
    operations: ['stock'],
    cacheTtl: () => 30000,
    validate: (v) => v,
    upstream: async () => gate,
    takeQuota: async () => true,
    onEvent,
  });
  const a = request();
  a.headers.set('x-request-id', 'first');
  const b = request();
  b.headers.set('x-request-id', 'second');
  const p = handler(a);
  const q = handler(b);
  await new Promise((r) => setTimeout(r, 10));
  finish({});
  await Promise.all([p, q]);
  expect(onEvent.mock.calls.map(([e]) => [e.requestId, e.stage])).toEqual([
    ['first', 'upstream'],
    ['second', 'coalesced'],
  ]);
});
