/**
 * 워커 호출량 일별 고정 집계 테스트
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDailyWindows,
  fetchDailyWorkerInvocations,
  fetchRootGetRequestsForWindow,
  fetchWorkerInvocationsForWindow,
} from '../../scripts/ops/workers-chart-data.ts';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildDailyWindows', () => {
  it('KST 기준으로 시작일과 종료일을 포함한 일별 창을 만든다', () => {
    const windows = buildDailyWindows('2026-03-08', '2026-03-10');

    expect(windows).toHaveLength(3);
    expect(windows.map((window) => window.date)).toEqual([
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
    expect(windows[0]?.start.toISOString()).toBe('2026-03-07T15:00:00.000Z');
    expect(windows[0]?.end.toISOString()).toBe('2026-03-08T15:00:00.000Z');
    expect(windows[2]?.start.toISOString()).toBe('2026-03-09T15:00:00.000Z');
    expect(windows[2]?.end.toISOString()).toBe('2026-03-10T15:00:00.000Z');
  });
});

describe('fetchWorkerInvocationsForWindow', () => {
  it('응답 행을 모두 합산해서 하루 총 호출량을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [
                    { sum: { requests: 1200 } },
                    { sum: { requests: 34 } },
                    { sum: { requests: '56' } },
                    { sum: { requests: 'invalid' } },
                  ],
                },
              ],
            },
          },
        }),
      ),
    );

    const requests = await fetchWorkerInvocationsForWindow({
      accountId: 'account-id',
      apiToken: 'api-token',
      scriptName: 'daiso-mcp',
      start: new Date('2026-03-08T15:00:00.000Z'),
      end: new Date('2026-03-09T15:00:00.000Z'),
      fetchImpl: mockFetch,
    });

    expect(requests).toBe(1290);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer api-token',
        }),
      }),
    );
    const requestBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
    expect(requestBody.query).toContain('workersInvocationsAdaptive');
    expect(requestBody.query).toContain('scriptName: $scriptName');
    expect(requestBody.query).not.toContain('dimensions');
    expect(requestBody.query).not.toContain('httpRequestsAdaptiveGroups');
  });

  it('GraphQL 오류를 전달한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [{ message: 'permission denied' }],
        }),
      ),
    );

    await expect(
      fetchWorkerInvocationsForWindow({
        accountId: 'account-id',
        apiToken: 'api-token',
        scriptName: 'daiso-mcp',
        start: new Date('2026-03-08T15:00:00.000Z'),
        end: new Date('2026-03-09T15:00:00.000Z'),
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrow('Cloudflare GraphQL 오류');
  });

  it('global API key 인증 헤더로도 Worker 호출량을 조회한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [{ sum: { requests: 7 } }],
                },
              ],
            },
          },
        }),
      ),
    );

    const requests = await fetchWorkerInvocationsForWindow({
      accountId: 'account-id',
      apiEmail: 'user@example.com',
      globalApiKey: 'global-key',
      scriptName: 'daiso-mcp',
      start: new Date('2026-03-08T15:00:00.000Z'),
      end: new Date('2026-03-09T15:00:00.000Z'),
      fetchImpl: mockFetch,
    });

    expect(requests).toBe(7);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/graphql',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Auth-Email': 'user@example.com',
          'X-Auth-Key': 'global-key',
        }),
      }),
    );
  });
});

describe('fetchRootGetRequestsForWindow', () => {
  it('zone HTTP 요청 행을 모두 합산해서 루트 GET 요청량을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            viewer: {
              zones: [
                {
                  httpRequestsAdaptiveGroups: [
                    { count: 1200 },
                    { count: '34' },
                    { count: 'invalid' },
                  ],
                },
              ],
            },
          },
        }),
      ),
    );

    const requests = await fetchRootGetRequestsForWindow({
      apiToken: 'api-token',
      zoneId: 'zone-id',
      host: 'mcp.aka.page',
      path: '/',
      start: new Date('2026-05-27T07:24:50.000Z'),
      end: new Date('2026-05-27T15:00:00.000Z'),
      fetchImpl: mockFetch,
    });

    expect(requests).toBe(1234);
    const requestBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
    expect(requestBody.query).toContain('httpRequestsAdaptiveGroups');
    expect(requestBody.query).toContain('clientRequestHTTPMethodName: "GET"');
    expect(requestBody.variables).toEqual({
      zoneTag: 'zone-id',
      host: 'mcp.aka.page',
      path: '/',
      start: '2026-05-27T07:24:50.000Z',
      end: '2026-05-27T15:00:00.000Z',
    });
  });

  it('빈 조회 창이면 Cloudflare를 호출하지 않고 0을 반환한다', async () => {
    const requests = await fetchRootGetRequestsForWindow({
      apiToken: 'api-token',
      zoneId: 'zone-id',
      host: 'mcp.aka.page',
      path: '/',
      start: new Date('2026-05-27T15:00:00.000Z'),
      end: new Date('2026-05-27T15:00:00.000Z'),
      fetchImpl: mockFetch,
    });

    expect(requests).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('fetchDailyWorkerInvocations', () => {
  it('각 날짜를 개별 조회해서 기간과 무관한 고정 일별 합계를 만든다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                accounts: [
                  {
                    workersInvocationsAdaptive: [
                      { sum: { requests: 100 } },
                      { sum: { requests: 23 } },
                    ],
                  },
                ],
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                accounts: [
                  {
                    workersInvocationsAdaptive: [
                      { sum: { requests: 40 } },
                      { sum: { requests: 50 } },
                      { sum: { requests: 60 } },
                    ],
                  },
                ],
              },
            },
          }),
        ),
      );

    const points = await fetchDailyWorkerInvocations({
      accountId: 'account-id',
      apiToken: 'api-token',
      scriptName: 'daiso-mcp',
      startDateText: '2026-03-09',
      endDateText: '2026-03-10',
      fetchImpl: mockFetch,
    });

    expect(points).toEqual([
      { date: '2026-03-09', requests: 123 },
      { date: '2026-03-10', requests: 150 },
    ]);

    const firstCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
    const secondCallBody = JSON.parse(mockFetch.mock.calls[1]?.[1]?.body as string);

    expect(firstCallBody.variables).toEqual({
      accountTag: 'account-id',
      scriptName: 'daiso-mcp',
      start: '2026-03-08T15:00:00.000Z',
      end: '2026-03-09T15:00:00.000Z',
    });
    expect(secondCallBody.variables).toEqual({
      accountTag: 'account-id',
      scriptName: 'daiso-mcp',
      start: '2026-03-09T15:00:00.000Z',
      end: '2026-03-10T15:00:00.000Z',
    });
  });

  it('리다이렉트 시작 이후 루트 GET 요청량을 Worker 호출량에 합산한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                accounts: [
                  {
                    workersInvocationsAdaptive: [{ sum: { requests: 100 } }],
                  },
                ],
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                zones: [
                  {
                    httpRequestsAdaptiveGroups: [{ count: 25 }],
                  },
                ],
              },
            },
          }),
        ),
      );

    const points = await fetchDailyWorkerInvocations({
      accountId: 'account-id',
      apiToken: 'api-token',
      scriptName: 'daiso-mcp',
      startDateText: '2026-05-27',
      endDateText: '2026-05-27',
      zoneId: 'zone-id',
      rootRedirectStart: new Date('2026-05-27T07:24:50.000Z'),
      rootRequestsRetentionStart: new Date('2026-05-20T00:00:00.000Z'),
      fetchImpl: mockFetch,
    });

    expect(points).toEqual([{ date: '2026-05-27', requests: 125 }]);

    const rootGetBody = JSON.parse(mockFetch.mock.calls[1]?.[1]?.body as string);
    expect(rootGetBody.variables.start).toBe('2026-05-27T07:24:50.000Z');
    expect(rootGetBody.variables.end).toBe('2026-05-27T15:00:00.000Z');
  });

  it('zone analytics 보존기간 밖의 루트 GET 요청 조회는 건너뛴다', async () => {
    mockFetch.mockImplementation(async (_input: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (String(body.query).includes('httpRequestsAdaptiveGroups')) {
        return new Response(
          JSON.stringify({
            data: {
              viewer: {
                zones: [{ httpRequestsAdaptiveGroups: [{ count: 25 }] }],
              },
            },
          }),
        );
      }

      const start = String(body.variables.start);
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [{ sum: { requests: start.includes('06-03') ? 100 : 200 } }],
                },
              ],
            },
          },
        }),
      );
    });

    const points = await fetchDailyWorkerInvocations({
      accountId: 'account-id',
      apiToken: 'api-token',
      scriptName: 'daiso-mcp',
      startDateText: '2026-06-04',
      endDateText: '2026-06-05',
      zoneId: 'zone-id',
      rootRedirectStart: new Date('2026-05-27T07:24:50.000Z'),
      rootRequestsRetentionStart: new Date('2026-06-04T15:00:00.000Z'),
      fetchImpl: mockFetch,
      concurrency: 1,
    });

    expect(points).toEqual([
      { date: '2026-06-04', requests: 100 },
      { date: '2026-06-05', requests: 225 },
    ]);

    const rootGetCalls = mockFetch.mock.calls
      .map((call) => JSON.parse(String(call[1]?.body)))
      .filter((body) => String(body.query).includes('httpRequestsAdaptiveGroups'));

    expect(rootGetCalls).toHaveLength(1);
    expect(rootGetCalls[0]?.variables.start).toBe('2026-06-04T15:00:00.000Z');
    expect(rootGetCalls[0]?.variables.end).toBe('2026-06-05T15:00:00.000Z');
  });

  it('지정한 동시성 안에서 날짜별 조회를 병렬 실행하고 원래 날짜 순서를 유지한다', async () => {
    let active = 0;
    let maxActive = 0;
    mockFetch.mockImplementation(async (_input: string, init: RequestInit) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;

      const body = JSON.parse(String(init.body));
      const day = String(body.variables.start).slice(8, 10);
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [{ sum: { requests: Number(day) } }],
                },
              ],
            },
          },
        }),
      );
    });

    const points = await fetchDailyWorkerInvocations({
      accountId: 'account-id',
      apiToken: 'api-token',
      scriptName: 'daiso-mcp',
      startDateText: '2026-03-09',
      endDateText: '2026-03-11',
      fetchImpl: mockFetch,
      concurrency: 2,
    });

    expect(maxActive).toBe(2);
    expect(points).toEqual([
      { date: '2026-03-09', requests: 8 },
      { date: '2026-03-10', requests: 9 },
      { date: '2026-03-11', requests: 10 },
    ]);
  });
});
