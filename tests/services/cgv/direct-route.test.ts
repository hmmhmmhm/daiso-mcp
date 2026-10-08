/** CGV 직접 경로의 서명·입력 검증과 사전 점검을 검증합니다. */
import { afterEach, expect, it, vi } from 'vitest';
import { requestDirectRoute, checkDirectRoute } from '../../../src/utils/directRoutes.js';
import {
  isCgvUpstreamUnavailableError,
  CgvUpstreamUnavailableError,
} from '../../../src/services/cgv/errors.js';
import { cgvRelayBody } from '../../../src/services/cgv/relayTransport.js';
import { CGV_API } from '../../../src/services/cgv/api.js';
import { requestCgv } from '../../../src/services/cgv/transport.js';
import { withRouteRouting, routeOperation } from '../../../src/utils/routeHealth.js';
afterEach(() => vi.unstubAllGlobals());
const body = { theaterCode: '0056', playDate: '20261008' };
it.each([
  ['cgv-theaters', {}, 'searchRegnList', undefined],
  ['cgv-movies', body, 'searchOnlyCgvMovList', undefined],
  ['cgv-timetable', body, 'searchMovScnInfo', '08'],
  ['cgv-timetable-movie', { ...body, movieCode: '20000000' }, 'searchSchByMov', '01'],
] as const)(
  '고정 직접 작업 %s의 서명과 조회 조건을 유지한다',
  async (key, params, endpoint, scope) => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => Response.json({ statusCode: 0, data: [] }));
    vi.stubGlobal('fetch', fetcher);
    await expect(requestDirectRoute(key, params, 1000)).resolves.toEqual({
      statusCode: 0,
      data: [],
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url.pathname).toBe(`/cnm/atkt/${endpoint}`);
    expect(url.searchParams.get('coCd')).toBe('A420');
    expect(url.searchParams.get('rtctlScopCd')).toBe(scope ?? null);
    if (key !== 'cgv-theaters') expect(url.searchParams.get('siteNo')).toBe('0056');
    if (key === 'cgv-timetable-movie') expect(url.searchParams.get('movNo')).toBe('20000000');
    expect(init).toMatchObject({
      redirect: 'manual',
      credentials: 'omit',
      headers: { 'X-SIGNATURE': expect.any(String) },
    });
    expect(await checkDirectRoute(key)).toMatchObject({ key, direct: true });
  },
);
it.each(['20260230', '20261301'])(
  '달력에 없는 날짜 %s를 원본 호출 전에 거부한다',
  async (playDate) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(requestDirectRoute('cgv-movies', { ...body, playDate }, 1000)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it('빈 조회 값과 영화별 요청 본문을 고정 필드로 변환한다', () => {
  expect(cgvRelayBody(CGV_API.MOVIE_LIST_PATH, new URLSearchParams())).toEqual({
    theaterCode: '',
    playDate: '',
  });
  expect(cgvRelayBody(CGV_API.TIMETABLE_PATH, new URLSearchParams())).toEqual({
    theaterCode: '',
    playDate: '',
    movieCode: '',
  });
  expect(
    cgvRelayBody(
      CGV_API.TIMETABLE_PATH,
      new URLSearchParams({
        siteNo: '0056',
        scnYmd: '20261008',
        movNo: '20000000',
        untrusted: 'ignored',
      }),
    ),
  ).toEqual({ theaterCode: '0056', playDate: '20261008', movieCode: '20000000' });
});
it('CGV 원본 오류 판별은 실제 오류 클래스만 허용한다', () => {
  expect(isCgvUpstreamUnavailableError(new CgvUpstreamUnavailableError(403))).toBe(true);
  expect(isCgvUpstreamUnavailableError(new Error('HTTP 403'))).toBe(false);
});
it('최근 검사에서 허용된 직접 응답의 업무 오류는 중계로 전환하고 다음 직접 호출을 막는다', async () => {
  const pending: Promise<unknown>[] = [];
  const snapshot = {
    routes: { 'cgv-theaters': { key: 'cgv-theaters', direct: true, checkedAt: Date.now() } },
    relays: { cgv: { group: 'cgv', healthy: true, checkedAt: Date.now() } },
  };
  const ns = {
    idFromName: () => ({ toString: () => 'cgv-direct-business-error' }),
    get: () => ({ fetch: async () => Response.json(snapshot) }),
  } as unknown as DurableObjectNamespace;
  await withRouteRouting(
    ns,
    (p) => pending.push(p),
    () =>
      routeOperation(
        'cgv-theaters',
        1000,
        async () => null,
        async () => null,
      ),
  );
  await Promise.all(pending);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ statusCode: 1, data: [] }))
    .mockImplementation(async () => Response.json({ statusCode: 0, data: [] }));
  vi.stubGlobal('fetch', fetcher);
  const run = () =>
    withRouteRouting(
      ns,
      (p) => pending.push(p),
      () =>
        requestCgv(
          CGV_API.THEATER_LIST_PATH,
          new URLSearchParams({ coCd: 'A420' }),
          1000,
          undefined,
          { cgvRelayUrl: 'https://relay.example', cgvRelayToken: 'test' },
        ),
    );
  await expect(run()).resolves.toEqual({ statusCode: 0, data: [] });
  await expect(run()).resolves.toEqual({ statusCode: 0, data: [] });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(String(fetcher.mock.calls[0][0])).toContain('api.cgv.co.kr');
  expect(
    fetcher.mock.calls
      .slice(1)
      .every(([url]) => String(url).startsWith('https://relay.example/v1/cgv/')),
  ).toBe(true);
});
