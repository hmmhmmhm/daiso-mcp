import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { RATE_LIMIT_METRICS_LEDGER_NAME } from '../../src/durableObjects/rateLimitMetricsStore.js';
import {
  authenticatedHeaders,
  CONTRADICTORY_STATS_CASES,
  createStatsFixture,
  EMPTY_STATS,
  expectApiError,
  FILTERED_STATS,
  NOW_MS,
  SECRET,
  UNFILTERED_STATS,
} from './rateLimitStatsTestHelpers.js';

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/rate-limit/stats', () => {
  it.each([undefined, '', '   '] as const)(
    'HEALTH_CHECK_SECRET이 %s이면 기존 운영 설정 오류 503을 반환한다',
    async (secret) => {
      const fixture = createStatsFixture();
      fixture.env.HEALTH_CHECK_SECRET = secret;

      const response = await app.request('/api/rate-limit/stats', undefined, fixture.env);

      await expectApiError(
        response,
        503,
        'HEALTH_CHECK_SECRET_NOT_CONFIGURED',
        'HEALTH_CHECK_SECRET이 설정되어 있지 않습니다.',
      );
      expect(fixture.idFromName).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['누락', undefined],
    ['잘못된 bearer', { Authorization: 'Bearer wrong-secret' }],
    ['잘못된 key', { 'x-health-check-key': 'wrong-secret' }],
  ] as const)('%s 인증은 query 검증과 DO 접근보다 먼저 401을 반환한다', async (_, headers) => {
    const fixture = createStatsFixture();

    const response = await app.request(
      '/api/rate-limit/stats?from=not-a-date',
      headers === undefined ? undefined : { headers },
      fixture.env,
    );

    await expectApiError(
      response,
      401,
      'UNAUTHORIZED_RATE_LIMIT_STATS',
      '유효한 운영 시크릿 키가 필요합니다.',
    );
    expect(fixture.idFromName).not.toHaveBeenCalled();
  });

  it.each(['bearer', 'key'] as const)('%s 인증을 공용 운영 인증으로 허용한다', async (header) => {
    const fixture = createStatsFixture();

    const response = await app.request(
      '/api/rate-limit/stats?from=2026-07-22&to=2026-07-22',
      { headers: authenticatedHeaders(header) },
      fixture.env,
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(EMPTY_STATS);
  });

  it.each([
    ['알 수 없는 key', 'from=2026-07-22&to=2026-07-22&extra=1'],
    ['중복 from', 'from=2026-07-22&from=2026-07-21&to=2026-07-22'],
    ['중복 to', 'from=2026-07-22&to=2026-07-22&to=2026-07-21'],
    ['중복 service', 'from=2026-07-22&to=2026-07-22&service=cgv&service=cu'],
    ['from만 제공', 'from=2026-07-22'],
    ['to만 제공', 'to=2026-07-22'],
    ['빈 날짜', 'from=&to='],
    ['형식이 다른 날짜', 'from=2026-7-01&to=2026-07-22'],
    ['실재하지 않는 날짜', 'from=2026-02-30&to=2026-07-22'],
    ['역순 날짜', 'from=2026-07-22&to=2026-07-21'],
    ['대문자 서비스', 'from=2026-07-22&to=2026-07-22&service=CGV'],
    ['빈 서비스', 'from=2026-07-22&to=2026-07-22&service='],
  ] as const)('%s query shape를 400으로 거부하고 DO를 호출하지 않는다', async (_, query) => {
    const fixture = createStatsFixture();

    const response = await app.request(
      `/api/rate-limit/stats?${query}`,
      { headers: authenticatedHeaders() },
      fixture.env,
    );

    await expectApiError(
      response,
      400,
      'INVALID_RATE_LIMIT_STATS_QUERY',
      '통계 조회 조건이 올바르지 않습니다.',
    );
    expect(fixture.idFromName).not.toHaveBeenCalled();
  });

  it.each([
    ['보관 범위 이전', 'from=2026-06-22&to=2026-07-21'],
    ['미래 종료일', 'from=2026-07-22&to=2026-07-23'],
    ['31일 범위', 'from=2026-06-22&to=2026-07-22'],
  ] as const)('%s 요청을 backend 호출 전에 400으로 거부한다', async (_, query) => {
    const fixture = createStatsFixture();

    const response = await app.request(
      `/api/rate-limit/stats?${query}`,
      { headers: authenticatedHeaders() },
      fixture.env,
    );

    await expectApiError(
      response,
      400,
      'INVALID_RATE_LIMIT_STATS_QUERY',
      '통계 조회 조건이 올바르지 않습니다.',
    );
    expect(fixture.stubFetch).not.toHaveBeenCalled();
  });

  it('보관 범위의 정확한 30일을 허용한다', async () => {
    const fixture = createStatsFixture();

    const response = await app.request(
      '/api/rate-limit/stats?from=2026-06-23&to=2026-07-22',
      { headers: authenticatedHeaders() },
      fixture.env,
    );

    expect(response.status).toBe(200);
    expect(new URL(fixture.calls[0]!.url).search).toBe('?from=2026-06-23&to=2026-07-22');
  });

  it.each([
    ['KST 자정 직전', Date.parse('2026-07-21T14:59:59.999Z'), '2026-07-15', '2026-07-21'],
    ['KST 자정 경계', Date.parse('2026-07-21T15:00:00.000Z'), '2026-07-16', '2026-07-22'],
  ] as const)(
    '%s에는 현재 KST 일자 포함 최근 7일을 기본값으로 쓴다',
    async (_, nowMs, from, to) => {
      vi.mocked(Date.now).mockReturnValue(nowMs);
      const fixture = createStatsFixture();

      const response = await app.request(
        '/api/rate-limit/stats?service=cgv',
        { headers: authenticatedHeaders() },
        fixture.env,
      );

      expect(response.status).toBe(200);
      expect(new URL(fixture.calls[0]!.url).search).toBe(`?from=${from}&to=${to}&service=cgv`);
      expect(Date.now).toHaveBeenCalledTimes(1);
    },
  );

  it('binding이 없으면 인증과 검증 후 안정적인 503을 반환한다', async () => {
    const response = await app.request(
      '/api/rate-limit/stats',
      { headers: authenticatedHeaders() },
      { HEALTH_CHECK_SECRET: SECRET },
    );

    await expectApiError(
      response,
      503,
      'RATE_LIMIT_STATS_UNAVAILABLE',
      '호출 제한 통계를 조회할 수 없습니다.',
    );
  });

  it('예약 원장 객체에 인코딩한 필터를 전달하며 별도 quota 호출을 하지 않는다', async () => {
    const fixture = createStatsFixture(FILTERED_STATS);

    const response = await app.request(
      '/api/rate-limit/stats?from=2026-07-20&to=2026-07-22&service=cgv',
      {
        headers: {
          ...authenticatedHeaders(),
          'CF-Connecting-IP': '203.0.113.10',
        },
      },
      fixture.env,
    );

    expect(response.status).toBe(200);
    expect(fixture.idFromName).toHaveBeenCalledOnce();
    expect(fixture.idFromName).toHaveBeenCalledWith(RATE_LIMIT_METRICS_LEDGER_NAME);
    expect(fixture.get).toHaveBeenCalledWith(fixture.ledgerId);
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]!.method).toBe('GET');
    expect(fixture.calls[0]!.url).toBe(
      'https://daily-rate-limit/stats?from=2026-07-20&to=2026-07-22&service=cgv',
    );
  });

  it.each([
    ['backend throw', 'throw'],
    ['backend non-200', new Response('unavailable', { status: 500 })],
    ['backend invalid JSON', new Response('{', { status: 200 })],
    ['backend null JSON', null],
  ] as const)('%s를 거짓 0이 아닌 503으로 반환한다', async (_, outcome) => {
    const fixture = createStatsFixture(outcome);

    const response = await app.request(
      '/api/rate-limit/stats?from=2026-07-20&to=2026-07-22',
      { headers: authenticatedHeaders() },
      fixture.env,
    );

    await expectApiError(
      response,
      503,
      'RATE_LIMIT_STATS_UNAVAILABLE',
      '호출 제한 통계를 조회할 수 없습니다.',
    );
  });

  it.each([
    ['필수 배열 누락', { totals: EMPTY_STATS.totals }],
    ['합계가 객체 아님', { ...EMPTY_STATS, totals: null }],
    ['음수 합계', { ...EMPTY_STATS, totals: { blockedRequests: -1, uniqueIdentities: 0 } }],
    ['비정수 합계', { ...EMPTY_STATS, totals: { blockedRequests: 1.5, uniqueIdentities: 1 } }],
    ['unsafe 합계', { ...EMPTY_STATS, totals: { blockedRequests: 2 ** 53, uniqueIdentities: 1 } }],
    ['unique 초과', { ...EMPTY_STATS, totals: { blockedRequests: 1, uniqueIdentities: 2 } }],
    ['daily 비배열', { ...EMPTY_STATS, daily: null }],
    ['daily row 비객체', { ...EMPTY_STATS, daily: [null] }],
    [
      'daily 범위 밖',
      { ...EMPTY_STATS, daily: [{ day: '2026-07-19', blockedRequests: 0, uniqueIdentities: 0 }] },
    ],
    [
      'daily 비결정 순서',
      {
        ...EMPTY_STATS,
        daily: [
          { day: '2026-07-22', blockedRequests: 0, uniqueIdentities: 0 },
          { day: '2026-07-20', blockedRequests: 0, uniqueIdentities: 0 },
        ],
      },
    ],
    ['services 비배열', { ...EMPTY_STATS, services: null }],
    ['service row 비객체', { ...EMPTY_STATS, services: [null] }],
    [
      '알 수 없는 서비스',
      {
        ...EMPTY_STATS,
        services: [
          { day: '2026-07-20', service: 'unknown', blockedRequests: 0, uniqueIdentities: 0 },
        ],
      },
    ],
    [
      '필터와 다른 서비스',
      {
        ...EMPTY_STATS,
        services: [{ day: '2026-07-20', service: 'cu', blockedRequests: 0, uniqueIdentities: 0 }],
      },
    ],
    [
      '합산 overflow',
      {
        totals: { blockedRequests: Number.MAX_SAFE_INTEGER, uniqueIdentities: 0 },
        daily: [
          {
            day: '2026-07-20',
            blockedRequests: Number.MAX_SAFE_INTEGER,
            uniqueIdentities: 0,
          },
          { day: '2026-07-21', blockedRequests: 1, uniqueIdentities: 0 },
        ],
        services: [],
      },
    ],
  ] as const)('malformed aggregate(%s)는 503을 반환한다', async (_, stats) => {
    const fixture = createStatsFixture(stats);

    const response = await app.request(
      '/api/rate-limit/stats?from=2026-07-20&to=2026-07-22&service=cgv',
      { headers: authenticatedHeaders() },
      fixture.env,
    );

    expect(response.status).toBe(503);
  });

  it.each(CONTRADICTORY_STATS_CASES)(
    '모순 집계(%s)는 전체 합계가 맞아도 503을 반환한다',
    async (_, stats, requestKind) => {
      const fixture = createStatsFixture(stats);
      const service = requestKind === 'filtered' ? '&service=cgv' : '';

      const response = await app.request(
        `/api/rate-limit/stats?from=2026-07-20&to=2026-07-22${service}`,
        { headers: authenticatedHeaders() },
        fixture.env,
      );

      expect(response.status).toBe(503);
    },
  );

  it.each([
    ['empty', EMPTY_STATS, ''],
    ['filtered', FILTERED_STATS, '&service=cgv'],
    ['unfiltered', UNFILTERED_STATS, ''],
  ] as const)('유효한 %s 집계를 유지한다', async (_, stats, service) => {
    const fixture = createStatsFixture(stats);

    const response = await app.request(
      `/api/rate-limit/stats?from=2026-07-20&to=2026-07-22${service}`,
      { headers: authenticatedHeaders() },
      fixture.env,
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(stats);
  });

  it.each([201, 204, 206] as const)('내부 /stats HTTP %s는 503으로 거부한다', async (status) => {
    const body = status === 204 ? null : JSON.stringify(FILTERED_STATS);
    const fixture = createStatsFixture(
      new Response(body, { status, headers: { 'Content-Type': 'application/json' } }),
    );

    const response = await app.request(
      '/api/rate-limit/stats?from=2026-07-20&to=2026-07-22&service=cgv',
      { headers: authenticatedHeaders() },
      fixture.env,
    );

    expect(response.status).toBe(503);
  });

  it('검증된 집계 필드만 직렬화하고 원장 식별 정보는 전달하지 않는다', async () => {
    const privateStats = {
      ...FILTERED_STATS,
      identityId: 'opaque-id',
      eventId: 'event-1',
      rawIp: '203.0.113.10',
      totals: { ...FILTERED_STATS.totals, identityIds: ['opaque-id'] },
      daily: FILTERED_STATS.daily.map((row) => ({ ...row, identityId: 'opaque-id' })),
      services: FILTERED_STATS.services.map((row) => ({ ...row, eventIds: ['event-1'] })),
    };
    const fixture = createStatsFixture(privateStats);

    const response = await app.request(
      '/api/rate-limit/stats?from=2026-07-20&to=2026-07-22&service=cgv',
      { headers: authenticatedHeaders() },
      fixture.env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: FILTERED_STATS });
    expect(JSON.stringify(body)).not.toMatch(/identityId|eventId|rawIp|203\.0\.113\.10/);
  });
});
