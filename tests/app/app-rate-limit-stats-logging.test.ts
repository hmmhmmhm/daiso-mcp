import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import {
  authenticatedHeaders,
  createStatsFixture,
  EMPTY_STATS,
  NOW_MS,
  SECRET,
} from './rateLimitStatsTestHelpers.js';

const STATS_PATH = '/api/rate-limit/stats?from=2026-07-20&to=2026-07-22&service=cgv';

function expectSafeLog(spy: ReturnType<typeof vi.spyOn>): void {
  const logged = JSON.stringify(spy.mock.calls);
  expect(logged).not.toContain(SECRET);
  expect(logged).not.toContain('203.0.113.10');
  expect(logged).not.toContain('opaque-id');
  expect(logged).not.toContain('sensitive-response-body');
  expect(logged).not.toContain('/api/rate-limit/stats');
  expect(logged).not.toContain('from=');
  expect(logged).not.toContain('2026-07-20');
  expect(logged).not.toContain('Authorization');
  expect(logged).not.toContain('x-health-check-key');
}

async function requestStats(env: Parameters<typeof app.request>[2]): Promise<Response> {
  return app.request(
    STATS_PATH,
    {
      headers: {
        ...authenticatedHeaders(),
        'CF-Connecting-IP': '203.0.113.10',
        'x-private-marker': 'opaque-id',
      },
    },
    env,
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/rate-limit/stats 안전 로그', () => {
  it('binding 누락은 고정 분류만 기록한다', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await requestStats({ HEALTH_CHECK_SECRET: SECRET });

    expect(response.status).toBe(503);
    expect(consoleSpy).toHaveBeenCalledWith('호출 제한 통계 binding 누락');
    expectSafeLog(consoleSpy);
  });

  it('backend non-200은 상태 번호와 고정 분류만 기록한다', async () => {
    const fixture = createStatsFixture(
      new Response('sensitive-response-body opaque-id', { status: 503 }),
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await requestStats(fixture.env);

    expect(response.status).toBe(503);
    expect(consoleSpy).toHaveBeenCalledWith('호출 제한 통계 Durable Object 응답 실패', 503);
    expectSafeLog(consoleSpy);
  });

  it.each([
    ['invalid JSON', new Response('{"identityId":"opaque-id"', { status: 200 })],
    ['malformed aggregate', { ...EMPTY_STATS, identityId: 'opaque-id', daily: null }],
  ] as const)('%s은 응답 검증 실패 분류만 기록한다', async (_, outcome) => {
    const fixture = createStatsFixture(outcome);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await requestStats(fixture.env);

    expect(response.status).toBe(503);
    expect(consoleSpy).toHaveBeenCalledWith('호출 제한 통계 응답 검증 실패');
    expectSafeLog(consoleSpy);
  });

  it('throw는 오류 객체 없이 호출 실패 분류만 기록한다', async () => {
    const fixture = createStatsFixture('throw');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await requestStats(fixture.env);

    expect(response.status).toBe(503);
    expect(consoleSpy).toHaveBeenCalledWith('호출 제한 통계 Durable Object 호출 실패');
    expectSafeLog(consoleSpy);
  });

  it('예상된 인증·query 4xx는 오류 로그를 남기지 않는다', async () => {
    const fixture = createStatsFixture();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const unauthorized = await app.request(
      '/api/rate-limit/stats',
      { headers: { Authorization: 'Bearer rejected-secret' } },
      fixture.env,
    );
    const invalid = await app.request(
      '/api/rate-limit/stats?from=invalid',
      { headers: authenticatedHeaders() },
      fixture.env,
    );

    expect(unauthorized.status).toBe(401);
    expect(invalid.status).toBe(400);
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
