/**
 * 개별 서비스 헬스 체크 실행기
 */

import {
  EMART24_UPSTREAM_403_PATTERNS,
  GS25_CLOUDFRONT_403_PATTERNS,
  HEALTH_CHECKS,
  SEVENELEVEN_UPSTREAM_403_PATTERNS,
} from './healthCheckDefinitions.js';
import { hasRequiredRepresentativeFields, toCount, toFirstName } from './healthCheckShape.js';
import type {
  HealthCheckDefinition,
  HealthCheckMode,
  HealthCheckResult,
  HealthCheckStatus,
  HealthCheckSummary,
} from './healthCheckTypes.js';

export type {
  HealthCheckDefinition,
  HealthCheckMode,
  HealthCheckResult,
  HealthCheckStatus,
  HealthCheckSummary,
} from './healthCheckTypes.js';

interface RunHealthChecksParams {
  baseUrl: string;
  service?: string;
  check?: string;
  mode?: HealthCheckMode;
  timeoutMs?: number;
  slowThresholdMs?: number;
  includeSamples?: boolean;
  fresh?: boolean;
  cacheBust?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface HealthCheckCacheKeyParams {
  baseUrl: string;
  service?: string;
  check?: string;
  mode: HealthCheckMode;
  timeoutMs: number;
  slowThresholdMs?: number;
  includeSamples?: boolean;
  cacheBust?: boolean;
}

const HEALTH_CHECK_CACHE_TTL_MS = 300_000;
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 7000;
const MAX_HEALTH_CHECK_TIMEOUT_MS = 20_000;
const DEFAULT_HEALTH_CHECK_CONCURRENCY = 1;
const DEFAULT_HEALTH_CHECK_SLOW_THRESHOLD_MS = 0;

const healthCheckCache = new Map<string, { expiresAt: number; summary: HealthCheckSummary }>();

function clampTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    return DEFAULT_HEALTH_CHECK_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(timeoutMs), MAX_HEALTH_CHECK_TIMEOUT_MS);
}

function createCacheKey(params: HealthCheckCacheKeyParams): string {
  return [
    params.baseUrl,
    params.service || '',
    params.check || '',
    params.mode,
    params.timeoutMs,
    params.slowThresholdMs || 0,
    params.cacheBust ? 'cache-bust' : 'cache',
    params.includeSamples ? 'samples' : 'no-samples',
  ].join('|');
}

function selectChecks(params: Pick<RunHealthChecksParams, 'service' | 'check' | 'mode'>): HealthCheckDefinition[] {
  const mode = params.mode || 'quick';
  return HEALTH_CHECKS.filter((check) => {
    if (mode !== 'full' && check.mode !== mode) {
      return false;
    }
    if (params.service && check.service !== params.service) {
      return false;
    }
    if (params.check && check.id !== params.check) {
      return false;
    }
    return true;
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    }),
  );

  return results;
}

function aggregateStatus(checks: HealthCheckResult[]): HealthCheckStatus {
  if (checks.length === 0) {
    return 'skipped';
  }
  if (checks.some((check) => check.status === 'fail')) {
    return 'fail';
  }
  if (checks.some((check) => check.status === 'degraded')) {
    return 'degraded';
  }
  return 'ok';
}

function shouldDegradeFailedResponse(check: HealthCheckDefinition, message: string): boolean {
  return check.degradedFailurePatterns?.some((pattern) => message.includes(pattern)) ?? false;
}

function shouldDegradeCliContractPath(path: string, message: string): boolean {
  if (path.startsWith('/api/gs25/')) {
    return GS25_CLOUDFRONT_403_PATTERNS.some((pattern) => message.includes(pattern));
  }
  if (path.startsWith('/api/emart24/')) {
    return EMART24_UPSTREAM_403_PATTERNS.some((pattern) => message.includes(pattern));
  }
  if (path.startsWith('/api/seveneleven/')) {
    return SEVENELEVEN_UPSTREAM_403_PATTERNS.some((pattern) => message.includes(pattern));
  }
  return false;
}

function resolveCheckTimeoutMs(check: Pick<HealthCheckDefinition, 'timeoutMs'>, timeoutMs: number): number {
  if (check.timeoutMs === undefined) {
    return timeoutMs;
  }
  return Math.min(timeoutMs, Math.trunc(check.timeoutMs));
}

function resolveCliContractTimeoutMs(path: string, timeoutMs: number): number {
  if (path.startsWith('/api/oliveyoung/')) {
    return Math.min(timeoutMs, 5000);
  }
  return timeoutMs;
}

function buildCheckUrl(baseUrl: string, check: HealthCheckDefinition, timeoutMs: number, cacheBustValue?: number): string {
  const url = new URL(check.path, baseUrl);
  url.searchParams.set('timeoutMs', String(timeoutMs));
  if (typeof cacheBustValue === 'number') {
    url.searchParams.set('_healthCheck', String(cacheBustValue));
  }
  return url.toString();
}

const CLI_CONTRACT_PATHS = [
  '/health',
  '/api/daiso/products?q=%ED%85%8C%EC%9D%B4%ED%94%84&pageSize=1',
  '/api/daiso/stores?keyword=%EA%B0%95%EB%82%A8&pageSize=1',
  '/api/gs25/products?keyword=%EC%BD%9C%EB%9D%BC&limit=1',
  '/api/gs25/stores?keyword=%EA%B0%95%EB%82%A8&limit=1',
  '/api/seveneleven/products?query=%EC%BB%A4%ED%94%BC&size=1',
  '/api/emart24/products?keyword=%EC%BB%A4%ED%94%BC&pageSize=1',
  '/api/lottemart/products?keyword=%EC%BD%9C%EB%9D%BC&storeCode=2301&area=%EC%84%9C%EC%9A%B8&pageLimit=1',
  '/api/oliveyoung/products?keyword=%EC%84%A0%ED%81%AC%EB%A6%BC&size=1',
  '/api/megabox/theaters?keyword=%EA%B0%95%EB%82%A8&limit=1',
  '/api/lottecinema/theaters?keyword=%EC%9E%A0%EC%8B%A4&limit=1',
  '/api/cgv/theaters?keyword=%EA%B0%95%EB%82%A8&limit=1',
];

function isCliCompatibleEnvelope(path: string, body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const record = body as Record<string, unknown>;
  if (path === '/health') {
    return record.status === 'ok';
  }

  return record.success === true && typeof record.data === 'object' && record.data !== null;
}

async function runCliContractCheck(
  check: HealthCheckDefinition,
  params: Required<Pick<RunHealthChecksParams, 'baseUrl' | 'fetchImpl' | 'now' | 'timeoutMs'>> &
    Pick<RunHealthChecksParams, 'cacheBust'>,
): Promise<HealthCheckResult> {
  const startedAt = params.now();
  const cacheBustValue = params.cacheBust ? startedAt : undefined;
  const degradedMessages: string[] = [];

  for (const path of CLI_CONTRACT_PATHS) {
    const checkTimeoutMs = resolveCliContractTimeoutMs(path, params.timeoutMs);
    const syntheticCheck = { ...check, path };
    try {
      const response = await params.fetchImpl(buildCheckUrl(params.baseUrl, syntheticCheck, checkTimeoutMs, cacheBustValue), {
        signal: AbortSignal.timeout(checkTimeoutMs),
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        status?: string;
        error?: { message?: string };
      };

      if (!response.ok || !isCliCompatibleEnvelope(path, body)) {
        const message = body.error?.message || `${path} CLI 계약 응답이 올바르지 않습니다.`;
        if (shouldDegradeCliContractPath(path, message)) {
          degradedMessages.push(`${path}: ${message}`);
          continue;
        }

        return {
          id: check.id,
          service: check.service,
          target: check.target,
          status: 'fail',
          durationMs: params.now() - startedAt,
          httpStatus: response.status,
          message,
        };
      }
    } catch (error) {
      return {
        id: check.id,
        service: check.service,
        target: check.target,
        status: 'fail',
        durationMs: params.now() - startedAt,
        message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      };
    }
  }

  return {
    id: check.id,
    service: check.service,
    target: check.target,
    status: degradedMessages.length > 0 ? 'degraded' : 'ok',
    durationMs: params.now() - startedAt,
    message:
      degradedMessages.length > 0
        ? `known upstream issue: ${degradedMessages[0]}`
        : `${CLI_CONTRACT_PATHS.length} CLI contract endpoint(s) passed`,
  };
}

async function runSingleCheck(
  check: HealthCheckDefinition,
  params: Required<Pick<RunHealthChecksParams, 'baseUrl' | 'fetchImpl' | 'now' | 'timeoutMs'>> &
    Pick<RunHealthChecksParams, 'includeSamples' | 'slowThresholdMs' | 'cacheBust'>,
): Promise<HealthCheckResult> {
  if (check.kind === 'cli-contract') {
    return runCliContractCheck(check, params);
  }

  const timeoutMs = resolveCheckTimeoutMs(check, params.timeoutMs);
  const startedAt = params.now();
  const cacheBustValue = params.cacheBust ? startedAt : undefined;

  try {
    const response = await params.fetchImpl(buildCheckUrl(params.baseUrl, check, timeoutMs, cacheBustValue), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      data?: unknown;
      error?: { message?: string };
      meta?: { total?: number };
    };
    const durationMs = params.now() - startedAt;

    if (!response.ok || body.success === false) {
      const message = body.error?.message || `HTTP ${response.status}`;
      return {
        id: check.id,
        service: check.service,
        target: check.target,
        status: shouldDegradeFailedResponse(check, message) ? 'degraded' : 'fail',
        durationMs,
        httpStatus: response.status,
        message,
      };
    }

    const count = typeof body.meta?.total === 'number' ? body.meta.total : toCount(body.data);
    const shapeOk = hasRequiredRepresentativeFields(body.data, check.collectionKey, check.requiredFields);
    const slowThresholdMs = params.slowThresholdMs || DEFAULT_HEALTH_CHECK_SLOW_THRESHOLD_MS;
    const slow = slowThresholdMs > 0 && durationMs > slowThresholdMs;
    const status: HealthCheckStatus = count === 0 || !shapeOk || slow ? 'degraded' : 'ok';
    const first = params.includeSamples ? toFirstName(body.data) : undefined;
    const message =
      slow
        ? `slow response: ${durationMs}ms > ${slowThresholdMs}ms`
        : !shapeOk && count !== 0
        ? `response missing required fields: ${check.requiredFields!.join(', ')}`
        : count === null
          ? 'response ok'
          : `${count} item(s) returned`;

    return {
      id: check.id,
      service: check.service,
      target: check.target,
      status,
      durationMs,
      httpStatus: response.status,
      message,
      ...(first ? { sample: { first } } : {}),
    };
  } catch (error) {
    return {
      id: check.id,
      service: check.service,
      target: check.target,
      status: 'fail',
      durationMs: params.now() - startedAt,
      message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

export async function runHealthChecks(params: RunHealthChecksParams): Promise<HealthCheckSummary> {
  const now = params.now || Date.now;
  const fetchImpl = params.fetchImpl || ((input, init) => globalThis.fetch(input, init));
  const mode = params.mode || 'quick';
  const timeoutMs = clampTimeout(params.timeoutMs ?? DEFAULT_HEALTH_CHECK_TIMEOUT_MS);
  const slowThresholdMs =
    Number.isFinite(params.slowThresholdMs) && params.slowThresholdMs && params.slowThresholdMs > 0
      ? Math.trunc(params.slowThresholdMs)
      : DEFAULT_HEALTH_CHECK_SLOW_THRESHOLD_MS;
  const cacheKey = createCacheKey({ ...params, mode, timeoutMs, slowThresholdMs, baseUrl: params.baseUrl });
  const cached = healthCheckCache.get(cacheKey);
  const startedAt = now();

  if (!params.fresh && cached && cached.expiresAt > startedAt) {
    return {
      ...cached.summary,
      cached: true,
    };
  }

  const checks = await mapWithConcurrency(selectChecks(params), DEFAULT_HEALTH_CHECK_CONCURRENCY, (check) =>
      runSingleCheck(check, {
        baseUrl: params.baseUrl,
        fetchImpl,
        now,
        timeoutMs,
        slowThresholdMs,
        includeSamples: params.includeSamples,
        cacheBust: params.cacheBust,
      }),
  );
  const summary: HealthCheckSummary = {
    status: aggregateStatus(checks),
    checkedAt: new Date(startedAt).toISOString(),
    durationMs: now() - startedAt,
    cached: false,
    filters: {
      service: params.service || null,
      check: params.check || null,
      mode,
    },
    checks,
  };

  healthCheckCache.set(cacheKey, {
    expiresAt: startedAt + HEALTH_CHECK_CACHE_TTL_MS,
    summary,
  });

  return summary;
}

export function __testOnlyClearHealthCheckCache(): void {
  healthCheckCache.clear();
}
