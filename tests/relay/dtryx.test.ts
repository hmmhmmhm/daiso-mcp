import { describe, it, expect, vi } from 'vitest';
import { createDtryxRelay } from '../../scripts/relay/dtryx.js';
const token = 'test-token';
const input = { brandCode: 'art', cinemaCode: '000001', playDate: '20260928' };
const result = { RetCode: 'success', Recordset: [{ MovieCd: '1' }] };
const request = (body: unknown = input, path = 'timetable', signal?: AbortSignal) =>
  new Request(`http://localhost/v1/dtryx/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });
const setup = (options = {}) => {
  const fetcher = vi.fn(async () => Response.json(result));
  const takeQuota = vi.fn(async () => true);
  return {
    fetcher,
    takeQuota,
    handler: createDtryxRelay(token, { fetcher, takeQuota, ...options }),
  };
};
describe('디트릭스 로컬 릴레이', () => {
  it('고정 HTTPS URL과 작업 식별자로 원본 응답을 보존한다', async () => {
    const { handler, fetcher } = setup();
    expect(await (await handler(request())).json()).toEqual(result);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe('https://api.dtryx.com');
    expect(url.searchParams.get('PlaySDT')).toBe('2026-09-28');
    expect(url.searchParams.get('WorkGuID')).toBe('37E0BA0F-DA5F-4376-9BA4-B5D27286AB87');
    expect(init.redirect).toBe('manual');
  });
  it.each([
    null,
    [],
    {},
    { ...input, url: 'http://127.0.0.1' },
    { ...input, headers: {} },
    { ...input, brandCode: 'https://evil' },
    { ...input, brandCode: 'A' },
    { ...input, brandCode: 'a'.repeat(33) },
    { ...input, cinemaCode: 123456 },
    { ...input, playDate: '20260230' },
    { ...input, playDate: '20261301' },
    { ...input, playDate: 1e99 },
  ])('잘못된 입력 거절 %j', async (body) => {
    const { handler, takeQuota, fetcher } = setup();
    expect((await handler(request(body))).status).toBe(400);
    expect(takeQuota).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('인증, 상태 확인, 경로와 메서드를 검사한다', async () => {
    const { handler, takeQuota } = setup();
    expect((await handler(new Request('http://localhost/v1/dtryx/health'))).status).toBe(401);
    expect(
      (
        await handler(
          new Request('http://localhost/v1/dtryx/health', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        )
      ).status,
    ).toBe(200);
    for (const path of ['constructor', '__proto__', 'toString', 'movies?url=evil'])
      expect((await handler(request({}, path))).status).toBe(404);
    expect(
      (
        await handler(
          new Request('http://localhost/v1/dtryx/movies', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        )
      ).status,
    ).toBe(405);
    expect(takeQuota).not.toHaveBeenCalled();
  });
  it.each(['play-dates', 'movies'])('날짜 없는 경로 %s', async (path) => {
    const { handler } = setup();
    expect((await handler(request({ brandCode: 'a_0-', cinemaCode: '000001' }, path))).status).toBe(
      200,
    );
    expect((await handler(request(input, path))).status).toBe(400);
  });
  it.each([301, 204, 500])('원본 HTTP %i를 거절한다', async (status) => {
    const { handler } = setup({ fetcher: async () => new Response(null, { status }) });
    expect((await handler(request())).status).toBe(502);
  });
  it.each([
    null,
    [],
    {},
    { RetCode: 'failed', Recordset: [] },
    { RetCode: 'success', Recordset: [null] },
    { RetCode: 'success', Recordset: [[]] },
  ])('원본 스키마 거절 %j', async (body) => {
    const { handler } = setup({ fetcher: async () => Response.json(body) });
    expect((await handler(request())).status).toBe(502);
  });
  it('용량 제한과 JSON 오류를 거절한다', async () => {
    const { handler } = setup();
    expect((await handler(request('a'.repeat(16384)))).status).toBe(413);
    expect(
      (
        await handler(
          new Request('http://localhost/v1/dtryx/movies', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: '{',
          }),
        )
      ).status,
    ).toBe(400);
    const huge = setup({ fetcher: async () => new Response('a'.repeat(2097153)) });
    expect((await huge.handler(request())).status).toBe(502);
  });
  it('할당량 거절 및 저장 실패는 안전하게 처리한다', async () => {
    expect((await setup({ takeQuota: async () => false }).handler(request())).status).toBe(429);
    expect(
      (
        await setup({
          takeQuota: async () => {
            throw Error('secret');
          },
        }).handler(request())
      ).status,
    ).toBe(503);
  });
  it('전체 기한을 원본과 요청 본문에 적용한다', async () => {
    vi.useFakeTimers();
    try {
      const { handler } = setup({ fetcher: () => new Promise(() => {}) });
      const pending = handler(request());
      await vi.advanceTimersByTimeAsync(15000);
      expect((await pending).status).toBe(504);
      const stalled = new Request('http://localhost/v1/dtryx/movies', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: new ReadableStream(),
        duplex: 'half',
      } as RequestInit);
      const bodyPending = handler(stalled);
      await vi.advanceTimersByTimeAsync(15000);
      expect((await bodyPending).status).toBe(504);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('대기 취소는 예산을 소비하지 않고 동시4개·전체32개를 제한한다', async () => {
    const releases: (() => void)[] = [];
    const fetcher = vi.fn(
      () => new Promise<Response>((resolve) => releases.push(() => resolve(Response.json(result)))),
    );
    const { handler, takeQuota } = setup({ fetcher });
    const controllers = Array.from({ length: 32 }, () => new AbortController());
    const pending = controllers.map((c) => handler(request(input, 'timetable', c.signal)));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect((await handler(request())).status).toBe(503);
    controllers[4].abort();
    expect((await pending[4]).status).toBe(499);
    expect(takeQuota).toHaveBeenCalledTimes(4);
    releases[0]();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    controllers.forEach((c) => c.abort());
    await Promise.all(pending);
    expect((await setup().handler(request())).status).toBe(200);
  });
  it('빈 토큰·본문·이미 취소된 요청과 오류 스트림을 처리한다', async () => {
    expect(() => createDtryxRelay(' ', { takeQuota: async () => true })).toThrow();
    const { handler } = setup();
    const empty = new Request('http://localhost/v1/dtryx/movies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await handler(empty)).status).toBe(400);
    const controller = new AbortController();
    controller.abort();
    expect((await handler(request(input, 'timetable', controller.signal))).status).toBe(499);
    const stream = new ReadableStream({
      start(c) {
        c.error(Error('stream'));
      },
    });
    const broken = new Request('http://localhost/v1/dtryx/movies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect((await handler(broken)).status).toBe(400);
  });
  it('기본 fetch와 같은 길이의 잘못된 인증을 검사한다', async () => {
    vi.stubGlobal('fetch', async () => Response.json(result));
    try {
      const handler = createDtryxRelay(token, { takeQuota: async () => true });
      expect((await handler(request())).status).toBe(200);
      expect(
        (
          await handler(
            new Request('http://localhost/v1/dtryx/health', {
              headers: { Authorization: 'Bearer test-tokem' },
            }),
          )
        ).status,
      ).toBe(401);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('본문 파싱 직후 취소하면 큐나 예산을 소비하지 않는다', async () => {
    const controller = new AbortController();
    const { handler, takeQuota } = setup();
    const original = JSON.parse;
    const spy = vi.spyOn(JSON, 'parse').mockImplementation((...args) => {
      const value = original(...args);
      controller.abort();
      return value;
    });
    try {
      expect((await handler(request(input, 'timetable', controller.signal))).status).toBe(499);
    } finally {
      spy.mockRestore();
    }
    expect(takeQuota).not.toHaveBeenCalled();
  });

  it('리다이렉트 본문 취소가 멈춰도 오류 응답을 반환한다', async () => {
    vi.useFakeTimers();
    try {
      const { handler } = setup({
        fetcher: async () =>
          new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), {
            status: 302,
          }),
      });
      let response: Response | undefined;
      const pending = handler(request()).then((value) => {
        response = value;
      });
      await vi.advanceTimersByTimeAsync(15000);
      expect(response?.status).toBe(502);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
  it('대기 중 기한 만료는 슬롯과 타이머를 반환하고 예산을 소비하지 않는다', async () => {
    vi.useFakeTimers();
    try {
      let blocked = true;
      const { handler, takeQuota } = setup({
        fetcher: () => (blocked ? new Promise(() => {}) : Promise.resolve(Response.json(result))),
      });
      const pending = Array.from({ length: 6 }, () => handler(request()));
      await vi.advanceTimersByTimeAsync(14999);
      expect(takeQuota).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(1);
      expect((await Promise.all(pending)).every((r) => r.status === 504)).toBe(true);
      expect(takeQuota).toHaveBeenCalledTimes(4);
      blocked = false;
      expect((await handler(request())).status).toBe(200);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('정리 실패와 원본 JSON 오류도 안전하게 처리한다', async () => {
    const { handler } = setup({
      fetcher: async () =>
        new Response(new ReadableStream({ cancel: () => Promise.reject(Error('cancel')) }), {
          status: 302,
        }),
    });
    expect((await handler(request())).status).toBe(502);
    expect(
      (await setup({ fetcher: async () => new Response('{') }).handler(request())).status,
    ).toBe(502);
  });
  it('연결 실패 내용을 숨기고 이미 취소된 오류 스트림의 거절을 관찰한다', async () => {
    const network = setup({
      fetcher: async () => {
        throw Error('private upstream detail');
      },
    });
    const response = await network.handler(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private');
    const controller = new AbortController();
    controller.abort();
    const body = new ReadableStream({
      start(c) {
        c.error(Error('already failed'));
      },
    });
    const req = new Request('http://localhost/v1/dtryx/movies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal: controller.signal,
      duplex: 'half',
    } as RequestInit);
    expect((await setup().handler(req)).status).toBe(499);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  it('인증된 상태 응답으로 실행과 대기 요청 수를 관찰한다', async () => {
    const { handler } = setup({ fetcher: () => new Promise(() => {}) });
    const controllers = Array.from({ length: 5 }, () => new AbortController());
    const pending = controllers.map((c) => handler(request(input, 'timetable', c.signal)));
    const health = () =>
      handler(
        new Request('http://localhost/v1/dtryx/health', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
    await vi.waitFor(async () =>
      expect(await (await health()).json()).toEqual({
        status: 'ok',
        active: 4,
        outstanding: 5,
        queued: 1,
      }),
    );
    controllers.forEach((c) => c.abort());
    await Promise.all(pending);
    expect(await (await health()).json()).toEqual({
      status: 'ok',
      active: 0,
      outstanding: 0,
      queued: 0,
    });
  });

  it('대기 요청은 FIFO 순서로 원본 호출을 시작한다', async () => {
    const started: string[] = [];
    const releases: (() => void)[] = [];
    const { handler } = setup({
      fetcher: (url: URL) => {
        started.push(url.searchParams.get('CinemaCd') as string);
        return new Promise<Response>((resolve) =>
          releases.push(() => resolve(Response.json(result))),
        );
      },
    });
    const controllers = Array.from({ length: 6 }, () => new AbortController());
    const pending = controllers.map((c, i) =>
      handler(request({ ...input, cinemaCode: String(i).padStart(6, '0') }, 'timetable', c.signal)),
    );
    await vi.waitFor(() => expect(started).toHaveLength(4));
    releases[1]();
    await vi.waitFor(() => expect(started).toHaveLength(5));
    releases[0]();
    await vi.waitFor(() =>
      expect(started).toEqual(['000000', '000001', '000002', '000003', '000004', '000005']),
    );
    controllers.forEach((c) => c.abort());
    await Promise.all(pending);
  });
});
