import { describe, expect, it, vi } from 'vitest';
import { fetchDailyWorkerInvocations } from '../../scripts/ops/workers-chart-data.ts';

const options = {
  accountId: 'account',
  apiToken: 'token',
  scriptName: 'daiso-mcp',
  startDateText: '2026-09-01',
  endDateText: '2026-09-01',
  zoneId: 'zone',
  rootRedirectStart: new Date('2026-05-27T07:24:50.000Z'),
  rootRequestsRetentionStart: new Date('2026-09-01T00:00:00.000Z'),
};
function cache() {
  return {
    accountId: 'account',
    scriptName: 'daiso-mcp',
    timezone: 'Asia/Seoul',
    metric: 'workersInvocationsAdaptive.requests + httpRequestsAdaptiveGroups.count',
    coverageVersion: 1,
    rootRedirect: {
      zoneId: 'zone',
      host: 'mcp.aka.page',
      path: '/',
      start: options.rootRedirectStart.toISOString(),
      rootRequestsRetentionDays: 7,
    },
    updatedAt: '2026-09-08T00:00:00.000Z',
    points: [{ date: '2026-09-01', requests: 1234 }],
  };
}
function fetcher() {
  return vi.fn(async (_url, init) => {
    const root = JSON.parse(init.body).query.includes('RootGetRequests');
    return new Response(
      JSON.stringify({
        data: {
          viewer: root
            ? { zones: [{ httpRequestsAdaptiveGroups: [{ count: 25 }] }] }
            : { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 100 } }] }] },
        },
      }),
    );
  });
}
describe('root GET retention', () => {
  it.each(['2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'])(
    '보존 경계 %s에서 완전한 과거 합계를 보존한다',
    async (boundary) => {
      const fetchImpl = fetcher();
      expect(
        await fetchDailyWorkerInvocations({
          ...options,
          rootRequestsRetentionStart: new Date(boundary),
          previousPayload: cache(),
          fetchImpl,
        }),
      ).toEqual(cache().points);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
  it('전체 날짜를 조회할 수 있으면 캐시보다 최신 합계를 사용한다', async () => {
    expect(
      await fetchDailyWorkerInvocations({
        ...options,
        rootRequestsRetentionStart: new Date('2026-08-31T15:00:00Z'),
        previousPayload: cache(),
        fetchImpl: fetcher(),
      }),
    ).toEqual([{ date: '2026-09-01', requests: 125 }]);
  });
  it.each([
    undefined,
    { ...cache(), accountId: 'other-account' },
    { ...cache(), accountId: undefined },
    {
      ...cache(),
      accountId: undefined,
      coverageVersion: undefined,
      updatedAt: '2026-09-02T00:00:00Z',
    },
    { ...cache(), metric: 'workersInvocationsAdaptive.requests' },
    { ...cache(), scriptName: 'other' },
    { ...cache(), timezone: 'UTC' },
    { ...cache(), rootRedirect: { ...cache().rootRedirect, host: 'other' } },
    { ...cache(), points: [{ date: '2026-09-01', requests: -1 }] },
  ])('완전한 동일 출처 캐시가 없으면 부분 합계 출력을 거부한다', async (previousPayload) => {
    await expect(
      fetchDailyWorkerInvocations({ ...options, previousPayload, fetchImpl: fetcher() }),
    ).rejects.toThrow('Incomplete daily traffic: 2026-09-01');
  });
  it('기존 스냅샷도 관측 시점에 완전한 창이었을 때만 사용한다', async () => {
    const previousPayload = {
      ...cache(),
      coverageVersion: undefined,
      updatedAt: '2026-09-02T00:00:00Z',
    };
    expect(
      await fetchDailyWorkerInvocations({ ...options, previousPayload, fetchImpl: fetcher() }),
    ).toEqual(cache().points);
    previousPayload.updatedAt = '2026-09-08T00:00:00Z';
    await expect(
      fetchDailyWorkerInvocations({ ...options, previousPayload, fetchImpl: fetcher() }),
    ).rejects.toThrow('Incomplete daily traffic');
  });
});
