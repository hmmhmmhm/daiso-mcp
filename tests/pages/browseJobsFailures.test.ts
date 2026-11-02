import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppBindings } from '../../src/api/response.js';
import {
  readBrowseText,
  withBrowseJob,
  registerBrowseJobRoutes,
} from '../../src/pages/browseJobs.js';

function fixture(mode = 'normal') {
  let resolve!: (r: Response) => void;
  let reject!: (e: Error) => void;
  const source = new Promise<Response>((a, b) => {
    resolve = a;
    reject = b;
  });
  const writes: unknown[] = [];
  const pending: Promise<unknown>[] = [];
  const context = {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p);
    },
  } as ExecutionContext;
  let failures = 0;
  const env = {
    BROWSE_READ_JOBS: {
      idFromName: () => 'id',
      get: () => {
        if (mode === 'lookupfail') throw new Error('storage unavailable');
        return {
          fetch: async (r: Request) => {
            if (new URL(r.url).pathname === '/start')
              return new Response(null, { status: mode === 'startfail' ? 503 : 201 });
            if (mode === 'writefail' && failures++ === 0) throw new Error('write failed');
            if (mode === 'allwritefail') throw new Error('write failed');
            writes.push(await r.json());
            return new Response(null, { status: 200 });
          },
        };
      },
    },
  } as unknown as AppBindings;
  const cancel = vi.fn();
  const app = new Hono<{ Bindings: AppBindings }>();
  app.onError((_e, c) => c.text('original failure', 500));
  app.get('/', (c) => withBrowseJob(c, () => source, cancel));
  return {
    app,
    env,
    context,
    pending,
    writes,
    resolve,
    reject,
    cancel,
    get: () => app.request('/', {}, env, context),
  };
}
afterEach(() => vi.useRealTimers());

describe('접수형 조회 실패 경계', () => {
  it.each(['lookupfail', 'startfail'])('%s이면 진행 중인 원본 응답으로 돌아간다', async (mode) => {
    vi.useFakeTimers();
    const f = fixture(mode);
    const work = f.get();
    await vi.advanceTimersByTimeAsync(1001);
    f.resolve(new Response('original response'));
    expect(await (await work).text()).toBe('original response');
    await Promise.all(f.pending);
    expect(f.writes).toHaveLength(0);
  });
  it('실행 컨텍스트가 없는 로컬 클라이언트는 기존 동기 응답을 사용한다', async () => {
    const f = fixture();
    f.resolve(new Response('sync'));
    expect(await (await f.app.request('/', {}, f.env)).text()).toBe('sync');
  });
  it('시간 제한은 취소를 호출하고 저장 상태를 미확인504로 남긴다', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const request = f.get();
    await vi.advanceTimersByTimeAsync(1001);
    expect(await (await request).text()).toContain('pending');
    await vi.advanceTimersByTimeAsync(24000);
    await Promise.all(f.pending);
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(f.writes).toEqual([expect.objectContaining({ status: 504 })]);
  });
  it.each(['normal', 'writefail', 'allwritefail'])(
    '%s 작업 오류를 미확인 상태로 처리한다',
    async (mode) => {
      vi.useFakeTimers();
      const f = fixture(mode);
      const request = f.get();
      await vi.advanceTimersByTimeAsync(1001);
      await request;
      if (mode === 'normal') f.reject(new Error('source unavailable'));
      else f.resolve(new Response('ready'));
      await Promise.all(f.pending);
      if (mode !== 'allwritefail')
        expect(f.writes).toEqual([expect.objectContaining({ status: 504 })]);
      else expect(f.writes).toHaveLength(0);
    },
  );
  it('빠른 원본 거절을 작업 성공으로 바꾸지 않는다', async () => {
    const f = fixture();
    const work = f.get();
    f.reject(new Error('early error'));
    expect((await work).status).toBe(500);
    await Promise.all(f.pending);
  });
  it('마지막 본문의 크기·스트림 오류도 정상 결과로 저장하지 않는다', async () => {
    vi.useFakeTimers();
    for (const error of [false, true]) {
      const f = fixture();
      const work = f.get();
      await vi.advanceTimersByTimeAsync(1001);
      await work;
      f.resolve(
        error
          ? new Response(
              new ReadableStream({
                start(c) {
                  c.error(new Error('read failed'));
                },
              }),
            )
          : new Response('가'.repeat(90000)),
      );
      await Promise.all(f.pending);
      expect(f.writes).toEqual([expect.objectContaining({ status: error ? 504 : 502 })]);
    }
  });
  it('본문이 없는 완료는 기본 HTML 타입으로 저장한다', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const work = f.get();
    await vi.advanceTimersByTimeAsync(1001);
    await work;
    f.resolve(new Response(null));
    await Promise.all(f.pending);
    expect(f.writes).toEqual([
      expect.objectContaining({ status: 200, body: '', contentType: 'text/html; charset=utf-8' }),
    ]);
  });
  it('빈 응답·다중 UTF8 청크를 읽고 저장소 없는 주소는503으로 표시한다', async () => {
    expect(await readBrowseText(new Response(null))).toBe('');
    const bytes = new TextEncoder().encode('지갑');
    expect(
      await readBrowseText(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(bytes.slice(0, 1));
              c.enqueue(bytes.slice(1));
              c.close();
            },
          }),
        ),
      ),
    ).toBe('지갑');
    const app = new Hono<{ Bindings: AppBindings }>();
    registerBrowseJobRoutes(app);
    expect(
      (
        await app.request(
          '/browse/jobs/12345678-1234-4123-8123-123456789abc/12345678-1234-4123-8123-123456789abc',
        )
      ).status,
    ).toBe(503);
  });
});
