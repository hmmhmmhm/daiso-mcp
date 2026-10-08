/** CGV 중계의 짧은 성공 캐시와 진행 조회 병합을 검증합니다. */
import { afterEach, expect, it, vi } from 'vitest';
import { createCgvRelay } from '../../../scripts/relay/cgv.js';
function request(operation: string, body: unknown) {
  return new Request(`http://127.0.0.1/v1/cgv/${operation}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}
afterEach(() => vi.restoreAllMocks());
const params = { theaterCode: '0056', playDate: '20261008' };
it.each([
  ['theaters', {}, 300000],
  ['movies', params, 300000],
  ['timetable', params, 30000],
  ['timetable-movie', { ...params, movieCode: '20000000' }, 30000],
])(
  '%s 입력 %j 성공은 %i 밀리초까지 원본 조회와 예산을 재사용한다',
  async (operation, body, ttl) => {
    let now = 1000000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const takeQuota = vi.fn(async () => true);
    let remainingSeats = 10;
    const fetcher = vi.fn(async () =>
      Response.json({ statusCode: 0, data: [{ frSeatCnt: remainingSeats }] }),
    );
    const relay = createCgvRelay('test-token', { takeQuota, fetcher });
    expect((await relay(request(operation as string, body))).status).toBe(200);
    now += Number(ttl) - 1;
    remainingSeats = 9;
    const cached = await relay(request(operation as string, body));
    expect(await cached.json()).toEqual({ statusCode: 0, data: [{ frSeatCnt: 10 }] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(takeQuota).toHaveBeenCalledTimes(1);
    now += 1;
    const fresh = await relay(request(operation as string, body));
    expect(await fresh.json()).toEqual({ statusCode: 0, data: [{ frSeatCnt: 9 }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(takeQuota).toHaveBeenCalledTimes(2);
  },
);
it('동시에 겹친 같은 시간표 요청은 원본과 예산을 한 번만 소비한다', async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const fetcher = vi.fn(async () => {
    await gate;
    return Response.json({ statusCode: 0, data: [] });
  });
  const takeQuota = vi.fn(async () => true);
  const relay = createCgvRelay('test-token', { takeQuota, fetcher });
  const responses = [
    relay(request('timetable', params)),
    relay(request('timetable', { playDate: params.playDate, theaterCode: params.theaterCode })),
  ];
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
  finish();
  expect((await Promise.all(responses)).map((response) => response.status)).toEqual([200, 200]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(takeQuota).toHaveBeenCalledTimes(1);
});
it.each([500, 200])('HTTP %i 원본 오류 또는 업무 오류는 캐시하지 않는다', async (status) => {
  const fetcher = vi
    .fn()
    .mockImplementationOnce(async () =>
      status === 500
        ? new Response('failure', { status })
        : Response.json({ statusCode: 1, data: [] }),
    )
    .mockImplementation(async () => Response.json({ statusCode: 0, data: [] }));
  const takeQuota = vi.fn(async () => true);
  const relay = createCgvRelay('test-token', { takeQuota, fetcher });
  expect((await relay(request('theaters', {}))).status).toBe(502);
  expect((await relay(request('theaters', {}))).status).toBe(200);
  expect((await relay(request('theaters', {}))).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(takeQuota).toHaveBeenCalledTimes(2);
});
