/** 최초 실패를 유지하면서 분당 제한 검사만 한 번 재검증합니다. */
import { afterEach, expect, it, vi } from 'vitest';
import { HEALTH_CHECKS } from '../../src/api/healthCheckDefinitions.js';
import type { HealthCheckResult, HealthCheckSummary } from '../../src/api/healthCheckTypes.js';
import { isValidHealthPayload, retryMinuteChecks, MINUTE_RECHECK_IDS } from '../../scripts/ops/health-check-retry.js';
function check(id: string, overrides: Partial<HealthCheckResult> = {}): HealthCheckResult {
  return { id, service: id.split('.')[0], target: '/api', durationMs: 1, status: 'fail', message: 'limited', httpStatus: 429, upstreamStatus: 429, errorCode: 'CONVENIENCE_RELAY_FAILED', quotaReason: 'minute', retryAfter: 14, ...overrides };
}
function payload(checks: HealthCheckResult[]): HealthCheckSummary {
  return { status: checks.some(c => c.status === 'fail') ? 'fail' : checks.some(c => c.status === 'degraded') ? 'degraded' : 'ok', checks, checkedAt: '2026-10-08T00:00:00Z', durationMs: 1, cached: false, filters: { service: null, check: null, mode: 'full' } };
}
const endpoint = 'https://health.example/api/health/checks?mode=full&fresh=true&timeoutMs=20000';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('전체 재실행 없이 최대 Retry-After 이후 알려진 실패 ID만 한 번 확인한다', async () => {
  const initial = payload([check('cu.stores'), check('gs25.products', { retryAfter: 21 }), check('cgv.theaters', { status: 'ok' }), check('seveneleven.inventory', { quotaReason: 'daily' })]);
  const sleep = vi.fn(async () => undefined);
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const id = new URL(String(url)).searchParams.get('check')!;
    expect(HEALTH_CHECKS.some(c => c.id === id)).toBe(true);
    return Response.json(payload([check(id, { status: 'ok', message: 'verified' })]));
  });
  const result = await retryMinuteChecks(initial, { endpoint, secret: 'test-secret', sleep, fetchImpl });
  expect(sleep).toHaveBeenCalledExactlyOnceWith(22000);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls.map(c => new URL(String(c[0])).searchParams.get('check'))).toEqual(['cu.stores', 'gs25.products']);
  expect(result.payload.status).toBe('fail');
  expect(result.payload.checks.map(c => c.status)).toEqual(['ok', 'ok', 'ok', 'fail']);
  expect(initial.checks[0].status).toBe('fail');
  expect(result.attempts).toHaveLength(2);
});
it.each([0, -1, 1.5, 61, NaN, Infinity, '14', undefined])('무효 재시도 값 %s는 호출하거나 대기하지 않는다', async retryAfter => {
  const initial = payload([check('cu.stores', { retryAfter: retryAfter as number })]);
  const fetchImpl = vi.fn(); const sleep = vi.fn();
  expect((await retryMinuteChecks(initial, { endpoint, secret: 'secret', fetchImpl, sleep })).payload).toBe(initial);
  expect(fetchImpl).not.toHaveBeenCalled(); expect(sleep).not.toHaveBeenCalled();
});
it.each(['daily', 'consumer', 'consumer-busy', undefined])('분당 한도가 아닌 %s 실패는 반복하지 않는다', async quotaReason => {
  const fetchImpl = vi.fn();
  await retryMinuteChecks(payload([check('cu.stores', { quotaReason: quotaReason as 'daily' })]), { endpoint, secret: 'secret', fetchImpl });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('알 수 없는 ID와 정상·degraded 검사는 다시 호출하지 않는다', async () => {
  const fetchImpl = vi.fn();
  await retryMinuteChecks(payload([check('unknown'), check('cu.stores', { status: 'ok' }), check('gs25.products', { status: 'degraded' })]), { endpoint, secret: 'secret', fetchImpl });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it.each(['fail', 'degraded', 'skipped', 'other-id', 'invalid', 'http', 'network'])('재확인이 %s이면 최초 실패를 숨기지 않는다', async outcome => {
  const initial = payload([check('cu.stores')]);
  const fetchImpl = vi.fn(async () => {
    if (outcome === 'network') throw new Error('private');
    if (outcome === 'http') return new Response('private', { status: 503 });
    if (outcome === 'invalid') return new Response('broken');
    return Response.json(payload([check(outcome === 'other-id' ? 'gs25.products' : 'cu.stores', { status: (outcome === 'other-id' ? 'ok' : outcome) as HealthCheckResult['status'] })]));
  });
  const result = await retryMinuteChecks(initial, { endpoint, secret: 'secret', fetchImpl, sleep: async () => undefined });
  expect(result.payload.checks[0]).toBe(initial.checks[0]); expect(result.payload.status).toBe('fail');
  expect(result.attempts).toHaveLength(1); expect(JSON.stringify(result)).not.toContain('private');
});
it('기한을 무시하는 fetch도 20초에 종료하고 원래 실패를 유지한다', async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
  const task = retryMinuteChecks(payload([check('cu.stores')]), { endpoint, secret: 'secret', fetchImpl, sleep: async () => undefined });
  await vi.advanceTimersByTimeAsync(20000);
  expect((await task).payload.status).toBe('fail'); expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('재확인 전체 예산 120초를 소진하면 남은 실패를 그대로 둔다', async () => {
  let now = 0;
  const fetchImpl = vi.fn(async () => { now += 120000; return Response.json(payload([check('cu.stores', { status: 'ok' })])); });
  const result = await retryMinuteChecks(payload([check('cu.stores'), check('gs25.products')]), { endpoint, secret: 'secret', fetchImpl, now: () => now, sleep: async () => undefined });
  expect(fetchImpl).toHaveBeenCalledTimes(1); expect(result.payload.status).toBe('fail'); expect(result.payload.checks[1].status).toBe('fail');
});
it('정확한 재확인이 모두 성공하면 aggregate를 다시 계산한다', async () => {
  const result = await retryMinuteChecks(payload([check('cu.stores')]), { endpoint, secret: 'secret', fetchImpl: async () => Response.json(payload([check('cu.stores', { status: 'ok' })])), sleep: async () => undefined });
  expect(result.payload.status).toBe('ok');
});
it.each([null, {}, { status: 'ok', checks: [] }, { status: 'ok', checks: [check('cu.stores')] }])('잘못된 최초 응답을 인정하지 않는다', value => expect(isValidHealthPayload(value)).toBe(false));

it.each([{ httpStatus: 502 }, { upstreamStatus: 403 }, { errorCode: 'UPSTREAM_FAILED' }, { errorCode: undefined }])('분당 문구가 있어도 중계 429 계약이 아니면 재시도하지 않는다: %j', async fields => {
  const fetchImpl = vi.fn();
  await retryMinuteChecks(payload([check('cu.stores', fields)]), { endpoint, secret: 'secret', fetchImpl, sleep: async () => undefined });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('허용 ID 목록은 실제 헬스 정의와 일치한다', () => {
  expect(MINUTE_RECHECK_IDS.every(id => HEALTH_CHECKS.some(check => check.id === id))).toBe(true);
});
it.each([
  ['oliveyoung.products', 'OLIVEYOUNG_RELAY_HTTP_ERROR'],
  ['dtryx.movies', 'DTRYX_RELAY_FAILED'], ['cgv.theaters', 'CGV_RELAY_FAILED'],
])('서비스 %s의 자체 중계 코드만 다시 확인한다', async (id, errorCode) => {
  const fetchImpl = vi.fn(async () => Response.json(payload([check(id, { status: 'ok' })])));
  expect((await retryMinuteChecks(payload([check(id, { errorCode })]), { endpoint, secret: 'secret', fetchImpl, sleep: async () => undefined })).payload.status).toBe('ok');
});
it('기본 대기와 fetch도 가짜 시계로 검증하며 인증·fresh 단일 검사만 보낸다', async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
    expect(url.searchParams.get('check')).toBe('cu.stores');
    expect(url.searchParams.get('service')).toBeNull();
    expect(init.headers).toEqual({ Authorization: 'Bearer secret', 'x-health-check-force-fresh': 'true' });
    return Response.json(payload([check('cu.stores', { status: 'ok' })]));
  });
  vi.stubGlobal('fetch', fetchImpl);
  const task = retryMinuteChecks(payload([check('cu.stores', { retryAfter: 60 })]), { endpoint: endpoint + '&service=gs25', secret: 'secret' });
  await vi.advanceTimersByTimeAsync(61000);
  expect((await task).payload.status).toBe('ok');
});
it('기한을 무시하는 JSON 본문도 요청 기한 안에 반환한다', async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn(async () => ({ ok: true, json: () => new Promise(() => undefined) }) as Response);
  const task = retryMinuteChecks(payload([check('cu.stores')]), { endpoint, secret: 'secret', fetchImpl, sleep: async () => undefined });
  await vi.advanceTimersByTimeAsync(20000);
  expect((await task).payload.status).toBe('fail');
});
it('유효하지 않은 최초 payload는 재검증 전에 실패한다', async () => {
  await expect(retryMinuteChecks({} as HealthCheckSummary, { endpoint, secret: 'secret' })).rejects.toThrow('Invalid');
});
it('남은 degraded 상태는 성공 재검증 뒤에도 집계에 유지한다', async () => {
  const result = await retryMinuteChecks(payload([check('cu.stores'), check('gs25.products', { status: 'degraded' })]), { endpoint, secret: 'secret', fetchImpl: async () => Response.json(payload([check('cu.stores', { status: 'ok' })])), sleep: async () => undefined });
  expect(result.payload.status).toBe('degraded');
});
it.each([
  { status: 'unknown', checks: [check('cu.stores')] },
  { status: 'fail', checks: [null] },
  { status: 'fail', checks: [check('')] },
  { status: 'fail', checks: [check('cu.stores', { message: 1 as unknown as string })] },
  { status: 'fail', checks: [check('cu.stores'), check('cu.stores')] },
])('구조·중복·집계가 잘못된 payload는 거부한다: %j', value => expect(isValidHealthPayload(value)).toBe(false));

it.each(['CGV_RELAY_FAILED', 'DTRYX_RELAY_FAILED', 'CONVENIENCE_RELAY_FAILED', 'OLIVEYOUNG_RELAY_HTTP_ERROR'])('CLI 계약의 자체 중계 %s 분당 제한도 단일 ID로 재확인한다', async errorCode => {
  const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
    expect(new URL(String(url)).searchParams.get('check')).toBe('cli.contract');
    return Response.json(payload([check('cli.contract', { status: 'ok' })]));
  });
  const result = await retryMinuteChecks(payload([check('cli.contract', { errorCode })]), { endpoint, secret: 'secret', fetchImpl, sleep: async () => undefined });
  expect(result.payload.status).toBe('ok'); expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('CLI 계약의 외부 비분류 오류는 분당 제한 문구가 있어도 반복하지 않는다', async () => {
  const fetchImpl = vi.fn();
  await retryMinuteChecks(payload([check('cli.contract', { errorCode: 'UPSTREAM_FAILED' })]), { endpoint, secret: 'secret', fetchImpl, sleep: async () => undefined });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('여러 ID 또는 캐시 결과는 최초 실패를 대체하지 않는다', async () => {
  for (const response of [payload([check('cu.stores', { status: 'ok' }), check('gs25.products', { status: 'ok' })]), { ...payload([check('cu.stores', { status: 'ok' })]), cached: true }]) {
    const result = await retryMinuteChecks(payload([check('cu.stores')]), { endpoint, secret: 'secret', fetchImpl: async () => Response.json(response), sleep: async () => undefined });
    expect(result.payload.status).toBe('fail');
  }
});
it('선택적 인기 검색어는 공식 200 빈 결과 skipped를 성공으로 인정한다', async () => {
  const response = payload([check('seveneleven.popwords', {
    status: 'skipped', message: 'optional data unavailable', httpStatus: 200,
    errorCode: undefined, upstreamStatus: undefined, quotaReason: undefined, retryAfter: undefined,
  })]);
  const result = await retryMinuteChecks(payload([check('seveneleven.popwords')]), {
    endpoint, secret: 'secret', sleep: async () => undefined, fetchImpl: async () => Response.json(response),
  });
  expect(result.payload.status).toBe('ok');
  expect(result.payload.checks[0].status).toBe('skipped');
});
it.each([
  { httpStatus: 429 }, { errorCode: 'CONVENIENCE_RELAY_FAILED' }, { upstreamStatus: 429 },
  { quotaReason: 'minute' as const }, { retryAfter: 1 },
])('선택적 skipped라도 오류 진단이 남으면 최초 실패를 유지한다: %j', async fields => {
  const response = payload([check('seveneleven.popwords', {
    status: 'skipped', message: 'optional data unavailable', httpStatus: 200,
    errorCode: undefined, upstreamStatus: undefined, quotaReason: undefined, retryAfter: undefined,
    ...fields,
  })]);
  const result = await retryMinuteChecks(payload([check('seveneleven.popwords')]), {
    endpoint, secret: 'secret', sleep: async () => undefined, fetchImpl: async () => Response.json(response),
  });
  expect(result.payload.status).toBe('fail');
});
it('전체 120초 예산에는 최초 61초 대기도 포함한다', async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
  const initial = payload(['cu.stores', 'gs25.products', 'seveneleven.popwords', 'seveneleven.inventory'].map(id => check(id, { retryAfter: 60 })));
  let complete = false;
  const task = retryMinuteChecks(initial, { endpoint, secret: 'secret', fetchImpl }).then(result => { complete = true; return result; });
  await vi.advanceTimersByTimeAsync(120000);
  expect(complete).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect((await task).payload.status).toBe('fail');
});
