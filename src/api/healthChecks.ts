/**
 * 개별 서비스 헬스 체크 실행기
 */

export type HealthCheckStatus = 'ok' | 'degraded' | 'fail' | 'skipped';

export interface HealthCheckDefinition {
  id: string;
  service: string;
  target: string;
  mode: 'quick' | 'deep';
  path: string;
  kind?: 'api' | 'cli-contract';
  collectionKey?: 'products' | 'stores' | 'theaters' | 'movies' | 'showtimes';
  requiredFields?: string[];
}

export interface HealthCheckResult {
  id: string;
  service: string;
  target: string;
  status: HealthCheckStatus;
  durationMs: number;
  message: string;
  httpStatus?: number;
  sample?: {
    first?: string;
  };
}

export interface HealthCheckSummary {
  status: HealthCheckStatus;
  checkedAt: string;
  durationMs: number;
  cached: boolean;
  filters: {
    service: string | null;
    check: string | null;
    mode: 'quick' | 'deep';
  };
  checks: HealthCheckResult[];
}

interface RunHealthChecksParams {
  baseUrl: string;
  service?: string;
  check?: string;
  mode?: 'quick' | 'deep';
  timeoutMs?: number;
  includeSamples?: boolean;
  fresh?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface HealthCheckCacheKeyParams {
  baseUrl: string;
  service?: string;
  check?: string;
  mode: 'quick' | 'deep';
  timeoutMs: number;
  includeSamples?: boolean;
}

const HEALTH_CHECK_CACHE_TTL_MS = 60_000;
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 7000;
const MAX_HEALTH_CHECK_TIMEOUT_MS = 10_000;

const HEALTH_CHECKS: HealthCheckDefinition[] = [
  {
    id: 'cli.contract',
    service: 'cli',
    target: 'api-contract',
    mode: 'deep',
    kind: 'cli-contract',
    path: '/health',
  },
  {
    id: 'daiso.products',
    service: 'daiso',
    target: 'products',
    mode: 'quick',
    path: '/api/daiso/products?q=%ED%85%8C%EC%9D%B4%ED%94%84&pageSize=1',
    collectionKey: 'products',
    requiredFields: ['id', 'name', 'productName', 'itemName', 'goodsName'],
  },
  {
    id: 'cu.stores',
    service: 'cu',
    target: 'stores',
    mode: 'quick',
    path: '/api/cu/stores?keyword=%EA%B0%95%EB%82%A8&limit=1',
    collectionKey: 'stores',
    requiredFields: ['storeCode', 'storeName', 'name'],
  },
  {
    id: 'emart24.products',
    service: 'emart24',
    target: 'products',
    mode: 'quick',
    path: '/api/emart24/products?keyword=%EC%BB%A4%ED%94%BC&pageSize=1',
    collectionKey: 'products',
    requiredFields: ['pluCd', 'goodsName', 'itemName', 'name'],
  },
  {
    id: 'gs25.products',
    service: 'gs25',
    target: 'products',
    mode: 'quick',
    path: '/api/gs25/products?keyword=%EC%BD%9C%EB%9D%BC&limit=1',
    collectionKey: 'products',
    requiredFields: ['itemCode', 'itemName', 'name'],
  },
  {
    id: 'gs25.stores',
    service: 'gs25',
    target: 'stores',
    mode: 'quick',
    path: '/api/gs25/stores?keyword=%EA%B0%95%EB%82%A8&limit=1',
    collectionKey: 'stores',
    requiredFields: ['storeCode', 'storeName', 'name'],
  },
  {
    id: 'seveneleven.products',
    service: 'seveneleven',
    target: 'products',
    mode: 'quick',
    path: '/api/seveneleven/products?query=%EC%BB%A4%ED%94%BC&size=1',
    collectionKey: 'products',
    requiredFields: ['itemCode', 'itemName', 'productNo', 'name'],
  },
  {
    id: 'lottemart.products',
    service: 'lottemart',
    target: 'products',
    mode: 'quick',
    path: '/api/lottemart/products?keyword=%EC%BD%9C%EB%9D%BC&storeCode=2301&area=%EC%84%9C%EC%9A%B8&pageLimit=1',
    collectionKey: 'products',
    requiredFields: ['productCode', 'name', 'productName'],
  },
  {
    id: 'oliveyoung.products',
    service: 'oliveyoung',
    target: 'products',
    mode: 'quick',
    path: '/api/oliveyoung/products?keyword=%EC%84%A0%ED%81%AC%EB%A6%BC&size=1',
    collectionKey: 'products',
    requiredFields: ['goodsNumber', 'goodsName', 'productNo', 'productName', 'name'],
  },
  {
    id: 'megabox.theaters',
    service: 'megabox',
    target: 'theaters',
    mode: 'quick',
    path: '/api/megabox/theaters?keyword=%EA%B0%95%EB%82%A8&limit=1',
    collectionKey: 'theaters',
    requiredFields: ['theaterCode', 'theaterName', 'name'],
  },
  {
    id: 'lottecinema.theaters',
    service: 'lottecinema',
    target: 'theaters',
    mode: 'quick',
    path: '/api/lottecinema/theaters?keyword=%EC%9E%A0%EC%8B%A4&limit=1',
    collectionKey: 'theaters',
    requiredFields: ['theaterCode', 'theaterName', 'name'],
  },
  {
    id: 'cgv.theaters',
    service: 'cgv',
    target: 'theaters',
    mode: 'quick',
    path: '/api/cgv/theaters?keyword=%EA%B0%95%EB%82%A8&limit=1',
    collectionKey: 'theaters',
    requiredFields: ['theaterCode', 'theaterName', 'name'],
  },
];

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
    params.includeSamples ? 'samples' : 'no-samples',
  ].join('|');
}

function selectChecks(params: Pick<RunHealthChecksParams, 'service' | 'check' | 'mode'>): HealthCheckDefinition[] {
  const mode = params.mode || 'quick';
  return HEALTH_CHECKS.filter((check) => {
    if (check.mode !== mode) {
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

function toCount(data: unknown): number | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.count === 'number') {
    return record.count;
  }

  for (const key of ['products', 'stores', 'theaters', 'movies', 'showtimes']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }

  return null;
}

function toFirstName(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  for (const key of ['products', 'stores', 'theaters', 'movies', 'showtimes']) {
    const value = record[key];
    if (!Array.isArray(value) || !value[0] || typeof value[0] !== 'object') {
      continue;
    }
    const item = value[0] as Record<string, unknown>;
    for (const nameKey of ['productName', 'itemName', 'goodsName', 'name', 'storeName', 'theaterName', 'movieName']) {
      if (typeof item[nameKey] === 'string' && item[nameKey].trim().length > 0) {
        return item[nameKey].trim();
      }
    }
  }

  return undefined;
}

function getCollectionItems(data: unknown, collectionKey?: HealthCheckDefinition['collectionKey']): unknown[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const record = data as Record<string, unknown>;
  if (collectionKey && Array.isArray(record[collectionKey])) {
    return record[collectionKey];
  }

  for (const key of ['products', 'stores', 'theaters', 'movies', 'showtimes']) {
    /* c8 ignore next -- 현재 정의된 체크는 collectionKey를 명시한다. */
    if (Array.isArray(record[key])) {
      return record[key];
    }
  }

  return [];
}

function hasRequiredRepresentativeFields(
  data: unknown,
  collectionKey: HealthCheckDefinition['collectionKey'],
  requiredFields: string[] = [],
): boolean {
  /* c8 ignore next -- 현재 정의된 API 체크는 requiredFields를 명시한다. */
  if (requiredFields.length === 0) {
    return true;
  }

  const items = getCollectionItems(data, collectionKey);
  if (items.length === 0) {
    return true;
  }

  const first = items[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    return false;
  }

  const record = first as Record<string, unknown>;
  return requiredFields.some((field) => {
    const value = record[field];
    return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
  });
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

function buildCheckUrl(baseUrl: string, check: HealthCheckDefinition, timeoutMs: number): string {
  const url = new URL(check.path, baseUrl);
  url.searchParams.set('timeoutMs', String(timeoutMs));
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
  params: Required<Pick<RunHealthChecksParams, 'baseUrl' | 'fetchImpl' | 'now' | 'timeoutMs'>>,
): Promise<HealthCheckResult> {
  const startedAt = params.now();

  for (const path of CLI_CONTRACT_PATHS) {
    const syntheticCheck = { ...check, path };
    try {
      const response = await params.fetchImpl(buildCheckUrl(params.baseUrl, syntheticCheck, params.timeoutMs), {
        signal: AbortSignal.timeout(params.timeoutMs),
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        status?: string;
        error?: { message?: string };
      };

      if (!response.ok || !isCliCompatibleEnvelope(path, body)) {
        return {
          id: check.id,
          service: check.service,
          target: check.target,
          status: 'fail',
          durationMs: params.now() - startedAt,
          httpStatus: response.status,
          message: body.error?.message || `${path} CLI 계약 응답이 올바르지 않습니다.`,
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
    status: 'ok',
    durationMs: params.now() - startedAt,
    message: `${CLI_CONTRACT_PATHS.length} CLI contract endpoint(s) passed`,
  };
}

async function runSingleCheck(
  check: HealthCheckDefinition,
  params: Required<Pick<RunHealthChecksParams, 'baseUrl' | 'fetchImpl' | 'now' | 'timeoutMs'>> &
    Pick<RunHealthChecksParams, 'includeSamples'>,
): Promise<HealthCheckResult> {
  if (check.kind === 'cli-contract') {
    return runCliContractCheck(check, params);
  }

  const timeoutMs = params.timeoutMs;
  const startedAt = params.now();

  try {
    const response = await params.fetchImpl(buildCheckUrl(params.baseUrl, check, timeoutMs), {
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
      return {
        id: check.id,
        service: check.service,
        target: check.target,
        status: 'fail',
        durationMs,
        httpStatus: response.status,
        message: body.error?.message || `HTTP ${response.status}`,
      };
    }

    const count = typeof body.meta?.total === 'number' ? body.meta.total : toCount(body.data);
    const shapeOk = hasRequiredRepresentativeFields(body.data, check.collectionKey, check.requiredFields);
    const status: HealthCheckStatus = count === 0 || !shapeOk ? 'degraded' : 'ok';
    const first = params.includeSamples ? toFirstName(body.data) : undefined;
    const message =
      !shapeOk && count !== 0
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
  const cacheKey = createCacheKey({ ...params, mode, timeoutMs, baseUrl: params.baseUrl });
  const cached = healthCheckCache.get(cacheKey);
  const startedAt = now();

  if (!params.fresh && cached && cached.expiresAt > startedAt) {
    return {
      ...cached.summary,
      cached: true,
    };
  }

  const checks = await Promise.all(
    selectChecks(params).map((check) =>
      runSingleCheck(check, {
        baseUrl: params.baseUrl,
        fetchImpl,
        now,
        timeoutMs,
        includeSamples: params.includeSamples,
      }),
    ),
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
