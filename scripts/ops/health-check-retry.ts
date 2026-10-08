/** 분당 중계 한도로 실패한 알려진 검사만 한 번 다시 확인합니다. */
import type { HealthCheckSummary, HealthCheckResult } from '../../src/api/healthCheckTypes.js';
export const MINUTE_RECHECK_IDS = [
  'cu.stores', 'cu.inventory', 'gs25.products', 'gs25.stores', 'gs25.inventory',
  'seveneleven.products', 'seveneleven.stores', 'seveneleven.popwords', 'seveneleven.inventory',
  'cli.contract', 'oliveyoung.products', 'oliveyoung.inventory', 'dtryx.movies', 'cgv.theaters',
];
function relayErrorCode(id: string): string {
  if (id.startsWith('oliveyoung.')) return 'OLIVEYOUNG_RELAY_HTTP_ERROR';
  if (id.startsWith('dtryx.')) return 'DTRYX_RELAY_FAILED';
  if (id.startsWith('cgv.')) return 'CGV_RELAY_FAILED';
  return 'CONVENIENCE_RELAY_FAILED';
}
function aggregate(checks: HealthCheckResult[]): 'ok' | 'degraded' | 'fail' {
  return checks.some(check => check.status === 'fail') ? 'fail'
    : checks.some(check => check.status === 'degraded') ? 'degraded' : 'ok';
}
export function isValidHealthPayload(value: unknown): value is HealthCheckSummary {
  if (!value || typeof value !== 'object') return false;
  const payload = value as HealthCheckSummary;
  return ['ok', 'degraded', 'fail'].includes(payload.status) &&
    Array.isArray(payload.checks) && payload.checks.length > 0 &&
    payload.checks.every(check => check && typeof check.id === 'string' && check.id.length > 0 &&
      ['ok', 'degraded', 'fail', 'skipped'].includes(check.status) && typeof check.message === 'string') &&
    new Set(payload.checks.map(check => check.id)).size === payload.checks.length &&
    payload.status === aggregate(payload.checks);
}
interface RetryOptions {
  endpoint: string;
  secret: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}
export async function retryMinuteChecks(payload: HealthCheckSummary, options: RetryOptions) {
  const attempts: Array<{ id: string; response?: unknown; error?: string }> = [];
  if (!isValidHealthPayload(payload)) throw new Error('Invalid health payload');
  const candidates = payload.checks.filter(check => check.status === 'fail' &&
    MINUTE_RECHECK_IDS.includes(check.id) && check.httpStatus === 429 && check.upstreamStatus === 429 &&
    (check.id === 'cli.contract'
      ? ['CONVENIENCE_RELAY_FAILED', 'OLIVEYOUNG_RELAY_HTTP_ERROR', 'DTRYX_RELAY_FAILED', 'CGV_RELAY_FAILED'].includes(check.errorCode ?? '')
      : check.errorCode === relayErrorCode(check.id)) && check.quotaReason === 'minute' &&
    typeof check.retryAfter === 'number' && Number.isInteger(check.retryAfter) &&
    check.retryAfter >= 1 && check.retryAfter <= 60);
  if (!candidates.length) return { payload, attempts };
  const now = options.now ?? Date.now;
  const deadline = now() + 120000;
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  await sleep((Math.max(...candidates.map(check => check.retryAfter!)) + 1) * 1000);
  const checks = [...payload.checks];
  for (const check of candidates) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    const url = new URL(options.endpoint);
    url.searchParams.delete('service');
    url.searchParams.set('check', check.id);
    url.searchParams.set('mode', 'full');
    url.searchParams.set('fresh', 'true');
    url.searchParams.set('timeoutMs', String(Math.min(15000, remaining)));
    const controller = new AbortController();
    let timer!: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Health recheck timed out'));
      }, Math.min(20000, remaining));
    });
    try {
      const response: unknown = await Promise.race([(async () => {
        const response = await (options.fetchImpl ?? fetch)(url, {
          headers: { Authorization: `Bearer ${options.secret}`, 'x-health-check-force-fresh': 'true' },
          redirect: 'error', signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Health recheck HTTP ${response.status}`);
        return response.json();
      })(), timeout]);
      attempts.push({ id: check.id, response });
      if (isValidHealthPayload(response) && response.checks.length === 1 &&
          response.checks[0].id === check.id && response.cached === false &&
          (response.checks[0].status === 'ok' ||
            (check.id === 'seveneleven.popwords' && response.checks[0].status === 'skipped' &&
              response.checks[0].httpStatus === 200 && response.checks[0].errorCode === undefined &&
              response.checks[0].upstreamStatus === undefined && response.checks[0].quotaReason === undefined &&
              response.checks[0].retryAfter === undefined))) {
        checks[checks.findIndex(original => original.id === check.id)] = response.checks[0];
      }
    } catch {
      // 원본 본문과 인증 정보는 오류 아티팩트에 기록하지 않습니다.
      attempts.push({ id: check.id, error: 'Health recheck failed or timed out' });
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return { payload: { ...payload, checks, status: aggregate(checks) }, attempts };
}
