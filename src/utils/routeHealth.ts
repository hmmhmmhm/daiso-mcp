/** 사전 점검 결과를 이용하며 요청 경로에서는 상태 저장소를 기다리지 않습니다. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { ServiceError } from '../core/errors.js';
import { HttpError } from './http.js';

export const ROUTE_KEYS = [
  'oy-find-store',
  'oy-product-search',
  'oy-goods-info',
  'oy-stock-stores',
  'cu-prime',
  'cu-stock',
  'cu-store',
  'gs25-products',
  'gs25-stock',
  'seven-goods',
  'seven-store',
  'seven-popwords',
  'seven-stock-meta',
  'seven-stock',
  'seven-pages',
  'seven-issues',
  'seven-exhibitions',
  'dtryx-movies',
  'dtryx-play-dates',
  'dtryx-timetable',
] as const;
export type RouteKey = (typeof ROUTE_KEYS)[number];
export const ROUTE_GROUPS = ['oliveyoung', 'convenience', 'dtryx'] as const;
export type RelayGroup = (typeof ROUTE_GROUPS)[number];
export interface RouteCheck {
  key: RouteKey;
  direct: boolean;
  checkedAt: number;
  reason?: string;
}
export interface RelayCheck {
  group: RelayGroup;
  healthy: boolean;
  checkedAt: number;
  reason?: string;
}
export interface RouteSnapshot {
  routes: Partial<Record<RouteKey, RouteCheck & { failedAt?: number; blockedUntil?: number }>>;
  relays: Partial<Record<RelayGroup, RelayCheck>>;
}
export const ROUTE_MAX_AGE_MS = 600000;
export const ROUTE_COOLDOWN_MS = 300000;
const SNAPSHOT_REFRESH_MS = 30000;
const STORAGE_NAME = 'upstream-route-health-v1';
type Context = { namespace: DurableObjectNamespace; waitUntil: (p: Promise<unknown>) => void };
type Cached = { snapshot: RouteSnapshot; refreshAt: number; snapshotAt: number };
const context = new AsyncLocalStorage<Context>();
const cache = new Map<string, Cached>();
const empty = (): RouteSnapshot => ({ routes: {}, relays: {} });
export function isRouteKey(value: unknown): value is RouteKey {
  return typeof value === 'string' && (ROUTE_KEYS as readonly string[]).includes(value);
}
export function isRelayGroup(value: unknown): value is RelayGroup {
  return typeof value === 'string' && (ROUTE_GROUPS as readonly string[]).includes(value);
}
/** 원문이나 토큰 대신 사전에 정한 진단 코드만 보관합니다. */
export function validReason(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      [
        'ok',
        'http',
        'network',
        'shape',
        'timeout',
        'unavailable',
        'quota',
        'configuration',
        'pinned',
        'pinned-relay',
        'http-error',
        'network-error',
        'invalid-response',
        'response-too-large',
        'cancelled',
        'invalid-input',
      ].includes(value))
  );
}
export function validTime(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Date.now() + 60000
  );
}
export function validRouteCheck(value: unknown): value is RouteCheck {
  if (!value || typeof value !== 'object') return false;
  const row = value as RouteCheck;
  return (
    isRouteKey(row.key) &&
    typeof row.direct === 'boolean' &&
    validTime(row.checkedAt) &&
    validReason(row.reason)
  );
}
export function validRelayCheck(value: unknown): value is RelayCheck {
  if (!value || typeof value !== 'object') return false;
  const row = value as RelayCheck;
  return (
    isRelayGroup(row.group) &&
    typeof row.healthy === 'boolean' &&
    validTime(row.checkedAt) &&
    validReason(row.reason)
  );
}
export function withRouteRouting<T>(
  namespace: DurableObjectNamespace | undefined,
  waitUntil: ((p: Promise<unknown>) => void) | undefined,
  work: () => T,
): T {
  return namespace && waitUntil ? context.run({ namespace, waitUntil }, work) : context.exit(work);
}
function objectId(namespace: DurableObjectNamespace) {
  return namespace.idFromName(STORAGE_NAME);
}
async function storageRequest<T = Response>(
  namespace: DurableObjectNamespace,
  path: string,
  data?: unknown,
  consume: (response: Response) => Promise<T> = async (response) => response as T,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  // fetch가 중단 신호를 무시해도 상태 호출의 대기 시간을 제한합니다.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, 2000);
  });
  try {
    return await Promise.race([
      namespace
        .get(objectId(namespace))
        .fetch(`https://route-health.internal${path}`, {
          method: data === undefined ? 'GET' : 'POST',
          ...(data === undefined
            ? {}
            : { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
          signal: controller.signal,
        })
        .then(consume),
      timeout,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function readRouteSnapshot(namespace: DurableObjectNamespace): Promise<RouteSnapshot> {
  try {
    const raw = await storageRequest(namespace, '/snapshot', undefined, async (response) =>
      response.ok ? ((await response.json()) as RouteSnapshot) : null,
    );
    if (
      !raw ||
      typeof raw.routes !== 'object' ||
      !raw.routes ||
      typeof raw.relays !== 'object' ||
      !raw.relays
    )
      return empty();
    const snapshot = empty();
    for (const key of ROUTE_KEYS) {
      const row = raw.routes[key];
      if (!validRouteCheck(row) || row.key !== key) continue;
      snapshot.routes[key] = {
        key,
        direct: key !== 'gs25-stock' && row.direct,
        checkedAt: row.checkedAt,
        ...(row.reason === undefined ? {} : { reason: row.reason }),
        ...(validTime(row.failedAt) ? { failedAt: row.failedAt } : {}),
        ...(typeof row.blockedUntil === 'number' &&
        Number.isSafeInteger(row.blockedUntil) &&
        row.blockedUntil >= 0 &&
        row.blockedUntil <= Date.now() + ROUTE_COOLDOWN_MS + 60000
          ? { blockedUntil: row.blockedUntil }
          : {}),
      };
    }
    for (const group of ROUTE_GROUPS) {
      const row = raw.relays[group];
      if (validRelayCheck(row) && row.group === group)
        snapshot.relays[group] = {
          group,
          healthy: row.healthy,
          checkedAt: row.checkedAt,
          ...(row.reason === undefined ? {} : { reason: row.reason }),
        };
    }
    return snapshot;
  } catch {
    return empty();
  }
}
export async function writeRouteChecks(
  namespace: DurableObjectNamespace,
  checks: RouteCheck[],
  relays: RelayCheck[],
): Promise<void> {
  try {
    await storageRequest(namespace, '/checks', { checks, relays });
  } catch {
    /* 상태 쓰기 장애는 서비스 요청에 전파하지 않습니다. */
  }
}
function background(ctx: Context, task: Promise<unknown>) {
  ctx.waitUntil(task.catch(() => undefined));
}
function groupFor(key: RouteKey): RelayGroup {
  return key.startsWith('oy-') ? 'oliveyoung' : key.startsWith('dtryx-') ? 'dtryx' : 'convenience';
}
function fresh(at: number, now: number) {
  return at <= now && now - at <= ROUTE_MAX_AGE_MS;
}
export async function routeOperation<T>(
  key: RouteKey,
  budgetMs: number,
  direct: (ms: number) => Promise<T>,
  relay: (ms: number) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const ctx = context.getStore();
  if (!ctx) return relay(budgetMs);
  let cacheKey: string;
  try {
    cacheKey = objectId(ctx.namespace).toString();
  } catch {
    return relay(budgetMs);
  }
  const now = Date.now();
  let cached = cache.get(cacheKey);
  if (!cached) {
    cached = { snapshot: empty(), refreshAt: 0, snapshotAt: 0 };
    cache.set(cacheKey, cached);
  }
  if (now - cached.refreshAt >= SNAPSHOT_REFRESH_MS) {
    cached.refreshAt = now;
    const target = cached;
    background(
      ctx,
      readRouteSnapshot(ctx.namespace).then((snapshot) => {
        // 비동기 읽기 중 발생한 실제 실패를 이전 저장소 응답으로 덮어쓰지 않습니다.
        for (const route of ROUTE_KEYS) {
          const local = target.snapshot.routes[route];
          if (
            local?.failedAt &&
            local.failedAt > (snapshot.routes[route]?.failedAt || 0) &&
            (snapshot.routes[route]?.checkedAt || 0) < local.failedAt + ROUTE_COOLDOWN_MS
          )
            snapshot.routes[route] = local;
        }
        target.snapshot = snapshot;
        target.snapshotAt = Date.now();
      }),
    );
  }
  const state = cached.snapshot.routes[key];
  const relayState = cached.snapshot.relays[groupFor(key)];
  const cacheFresh = now - cached.snapshotAt < SNAPSHOT_REFRESH_MS;
  const directUsable =
    cacheFresh &&
    key !== 'gs25-stock' &&
    state &&
    fresh(state.checkedAt, now) &&
    state.direct &&
    (state.blockedUntil || 0) <= now;
  if (!directUsable) {
    if (
      cacheFresh &&
      state &&
      fresh(state.checkedAt, now) &&
      !state.direct &&
      relayState &&
      fresh(relayState.checkedAt, now) &&
      !relayState.healthy
    )
      throw new ServiceError(
        'UPSTREAM_ROUTE_UNAVAILABLE',
        '외부 서비스 연결을 사용할 수 없습니다.',
        503,
        true,
      );
    return relay(budgetMs);
  }
  try {
    return await direct(Math.min(3000, budgetMs));
  } catch (error) {
    if (signal?.aborted || (error instanceof HttpError && [400, 404, 422].includes(error.status)))
      throw error;
    const at = Date.now();
    cached.snapshot.routes[key] = {
      ...state,
      direct: false,
      failedAt: at,
      blockedUntil: at + ROUTE_COOLDOWN_MS,
    };
    background(ctx, storageRequest(ctx.namespace, '/failure', { key, at }));
    const remaining = budgetMs - (at - now);
    if (remaining <= 0) throw error;
    signal?.throwIfAborted();
    if (relayState && fresh(relayState.checkedAt, at) && !relayState.healthy)
      throw new ServiceError(
        'UPSTREAM_ROUTE_UNAVAILABLE',
        '외부 서비스 연결을 사용할 수 없습니다.',
        503,
        true,
      );
    return relay(remaining);
  }
}
