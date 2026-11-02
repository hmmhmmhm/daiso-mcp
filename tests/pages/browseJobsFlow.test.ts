import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../../src/index.js';
import type { AppBindings } from '../../src/api/response.js';
import { registerBrowseRoutes } from '../../src/pages/browse.js';

const id = '12345678-1234-4123-8123-123456789abc';
function fixture() {
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      values.set(key, value);
    },
    setAlarm: vi.fn(async () => {}),
    deleteAll: async () => {
      values.clear();
    },
    transaction: async (fn: (s: unknown) => Promise<unknown>) => fn(storage),
  };
  const Ctor = (
    entry as unknown as {
      BrowseReadJob: new (state: { storage: unknown }) => { fetch(r: Request): Promise<Response> };
    }
  ).BrowseReadJob;
  expect(typeof Ctor).toBe('function');
  const job = new Ctor({ storage });
  const pending: Promise<unknown>[] = [];
  const context = {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p);
    },
  } as ExecutionContext;
  const env = {
    BROWSE_READ_JOBS: { idFromName: () => id, get: () => job },
  } as unknown as AppBindings;
  const app = new Hono<{ Bindings: AppBindings }>();
  let resolve!: (r: Response) => void;
  const source = new Promise<Response>((r) => {
    resolve = r;
  });
  let calls = 0;
  let signal: AbortSignal | undefined;
  let address: string | undefined;
  app.get('/api/daiso/products', (c) => {
    calls++;
    signal = c.req.raw.signal;
    address = c.req.header('cf-connecting-ip');
    return source;
  });
  registerBrowseRoutes(app);
  const get = (path: string, init?: RequestInit) => app.request(path, init, env, context);
  return {
    app,
    env,
    context,
    values,
    pending,
    get,
    resolve,
    count: () => calls,
    signal: () => signal,
    address: () => address,
  };
}
afterEach(() => vi.useRealTimers());

describe('읽기 접수와 실제 결과 전달', () => {
  it('느린 원본은 한 번만 실행하고 pending의 새 실제 링크에서 원본 오류를 보존한다', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const controller = new AbortController();
    const request = f.get(`/browse/read/${id}/daiso/products/지갑`, {
      headers: { 'cf-connecting-ip': '192.0.2.1', authorization: 'do-not-store' },
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(f.pending.length).toBeGreaterThan(0);
    controller.abort();
    expect(f.signal()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    const response = await request;
    const body = await response.text();
    expect(body).toContain('pending');
    expect(body).not.toContain('quantity');
    expect(f.address()).toBe('192.0.2.1');
    expect(f.pending.length).toBeGreaterThan(0);
    controller.abort();
    expect(f.signal()?.aborted).toBe(false);
    const link = body.match(/href="(\/browse\/jobs\/[^" ]+)">결과 확인/)![1];
    const stillPending = await (await f.get(link)).text();
    expect(stillPending).toContain('pending');
    expect(stillPending.match(/href="([^" ]+)">결과 확인/)![1]).not.toBe(link);
    f.resolve(
      new Response('<main>원본 요청 거절</main>', {
        status: 502,
        headers: {
          'Content-Type': 'text/html',
          'Set-Cookie': 'private=do-not-store',
          'Retry-After': '12',
        },
      }),
    );
    await Promise.all(f.pending);
    const result = await f.get(link);
    expect(result.status).toBe(502);
    expect(await result.text()).toContain('원본 요청 거절');
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(result.headers.get('Retry-After')).toBe('12');
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify([...f.values])).not.toContain('do-not-store');
    expect(f.count()).toBe(1);
  });
  it('빠른 원본은 기존 응답을 사용하고 작업을 생성하지 않는다', async () => {
    const f = fixture();
    f.resolve(
      new Response('<main>상품 실제 결과</main>', { headers: { 'Content-Type': 'text/html' } }),
    );
    const response = await f.get(`/browse/read/${id}/daiso/products/지갑`);
    expect(await response.text()).toContain('상품 실제 결과');
    expect(f.values.size).toBe(0);
    expect(f.pending).toHaveLength(1);
  });
  it.each(['fast', 'slow'])(
    '%s 과대 HTML을 시간 초과가 아닌 명시적 크기 오류로 반환한다',
    async (mode) => {
      vi.useFakeTimers();
      const f = fixture();
      const large = new Response('가'.repeat(90000), { headers: { 'Content-Type': 'text/html' } });
      if (mode === 'fast') f.resolve(large);
      const request = f.get(`/browse/read/${id}/daiso/products/지갑`);
      if (mode === 'slow') await vi.advanceTimersByTimeAsync(1001);
      const first = await request;
      let result = first;
      if (mode === 'slow') {
        const link = (await first.text()).match(/href="(\/browse\/jobs\/[^" ]+)">결과 확인/)![1];
        f.resolve(large);
        await Promise.all(f.pending);
        result = await f.get(link);
      }
      expect(result.status).toBe(502);
      expect(await result.text()).toContain('크기 제한');
    },
  );
  it('원본 HTML 스트림 오류는 크기 초과로 오진하지 않는다', async () => {
    const f = fixture();
    f.app.onError((_e, c) => c.text('원본 본문 실패', 500));
    f.resolve(
      new Response(
        new ReadableStream({
          start(c) {
            c.error(new Error('body failed'));
          },
        }),
        { headers: { 'Content-Type': 'text/html' } },
      ),
    );
    const result = await f.get(`/browse/read/${id}/daiso/products/지갑`);
    expect(result.status).toBe(500);
    expect(await result.text()).toBe('원본 본문 실패');
    await Promise.all(f.pending);
  });
  it('작업 조회의 잘못된 ID·메서드·만료를 구별하고 원본을 재호출하지 않는다', async () => {
    const f = fixture();
    expect((await f.get('/browse/jobs/bad/bad')).status).toBe(400);
    expect((await f.get(`/browse/jobs/${id}/${id}`, { method: 'POST' })).status).toBe(405);
    expect((await f.get(`/browse/jobs/${id}/${id}`)).status).toBe(410);
    expect(f.count()).toBe(0);
  });
});
