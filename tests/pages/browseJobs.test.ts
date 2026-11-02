import { describe, expect, it, vi } from 'vitest';
import * as entry from '../../src/index.js';

type JobStub = { fetch(request: Request): Promise<Response>; alarm(): Promise<void> };
function fixture() {
  const data = new Map<string, unknown>();
  const storage = {
    get: vi.fn(async (key: string) => data.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      data.set(key, value);
    }),
    setAlarm: vi.fn(async () => {}),
    deleteAll: vi.fn(async () => {
      data.clear();
    }),
    transaction: async <T>(fn: (tx: typeof storage) => Promise<T>): Promise<T> => fn(storage),
  };
  const Constructor = (
    entry as unknown as { BrowseReadJob: new (state: { storage: unknown }) => JobStub }
  ).BrowseReadJob;
  expect(typeof Constructor).toBe('function');
  const job = new Constructor({ storage });
  const get = () => job.fetch(new Request('https://job/'));
  const start = () => job.fetch(new Request('https://job/start', { method: 'POST' }));
  const complete = (value: unknown) =>
    job.fetch(new Request('https://job/complete', { method: 'POST', body: JSON.stringify(value) }));
  return { job, data, storage, get, start, complete };
}

describe('느린 읽기 작업의 저장 경계', () => {
  it('접수는 결과가 아니며 완료된 원본 오류 상태와 본문을 그대로 보존한다', async () => {
    const { get, start, complete } = fixture();
    expect((await get()).status).toBe(404);
    expect((await start()).status).toBe(201);
    expect((await get()).status).toBe(200);
    expect(await (await get()).json()).toMatchObject({ status: 'pending' });
    expect(
      (await complete({ status: 502, body: '<h1>외부 오류</h1>', contentType: 'text/html' }))
        .status,
    ).toBe(200);
    expect(await (await get()).json()).toMatchObject({
      status: 'ready',
      response: { status: 502, body: '<h1>외부 오류</h1>' },
    });
    expect(
      (await complete({ status: 200, body: 'replacement', contentType: 'text/html' })).status,
    ).toBe(409);
    expect((await start()).status).toBe(409);
  });
  it('일찍 실행된 알람은 완료를 지우지 않고 접수 시간 제한과 만료를 구분한다', async () => {
    vi.useFakeTimers();
    try {
      const { job, get, start, storage } = fixture();
      await start();
      await job.alarm();
      expect(await (await get()).json()).toMatchObject({ status: 'pending' });
      await vi.advanceTimersByTimeAsync(25001);
      await job.alarm();
      expect(await (await get()).json()).toMatchObject({
        status: 'ready',
        response: { status: 504 },
      });
      expect(storage.deleteAll).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300000);
      await job.alarm();
      expect((await get()).status).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });
  it('알람의 오래된 pending 관측으로 정상 결과를 덮어쓰지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      await f.start();
      const old = await (await f.get()).json();
      await f.complete({ status: 200, body: '정상 완료', contentType: 'text/html' });
      await vi.advanceTimersByTimeAsync(25001);
      f.storage.get.mockResolvedValueOnce(old);
      await f.job.alarm();
      expect(await (await f.get()).json()).toMatchObject({ response: { body: '정상 완료' } });
    } finally { vi.useRealTimers(); }
  });
  it('잘못된 완료·과대한 본문·미생성 완료·지원하지 않는 요청을 거절한다', async () => {
    const { job, complete, start } = fixture();
    expect((await complete({ status: 200, body: 'ok', contentType: 'text/html' })).status).toBe(
      409,
    );
    await start();
    for (const value of [
      null,
      {},
      { status: 204, body: 'x', contentType: 'text/html' },
      { status: 200, body: '가'.repeat(90000), contentType: 'text/html' },
      { status: 200, body: 'x', contentType: 'text/html\r\nsecret' },
    ])
      expect((await complete(value)).status).toBe(400);
    expect(
      (await job.fetch(new Request('https://job/complete', { method: 'POST', body: '{' }))).status,
    ).toBe(400);
    expect((await job.fetch(new Request('https://job/unknown', { method: 'POST' }))).status).toBe(
      405,
    );
  });
});
