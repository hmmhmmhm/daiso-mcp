/** 고정된 올리브영 조회만 허용하는 인증 릴레이. */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { OLIVEYOUNG_API } from '../../src/services/oliveyoung/api.js';
import type { OliveyoungApiResponse } from '../../src/services/oliveyoung/types.js';
import { createConsumerQuota } from './consumer.js';
import { canonicalKey, createResponseCache } from './cache.js';
import type { QuotaStatus } from './quota.js';
export type BrowserRunner = (
  path: string,
  body: Record<string, unknown>,
) => Promise<OliveyoungApiResponse>;
const paths: Record<string, string> = {
  'find-store': OLIVEYOUNG_API.STORE_FINDER_PATH,
  'product-search-v3': OLIVEYOUNG_API.PRODUCT_SEARCH_PATH,
  'stock-goods-info-v3': OLIVEYOUNG_API.STOCK_GOODS_INFO_PATH,
  'stock-stores': OLIVEYOUNG_API.STOCK_STORES_PATH,
};
const fields: Record<string, Record<string, 'string' | 'number' | 'boolean'>> = {
  'find-store': {
    lat: 'number',
    lon: 'number',
    pageIdx: 'number',
    searchWords: 'string',
    pogKeys: 'string',
    serviceKeys: 'string',
    mapLat: 'number',
    mapLon: 'number',
  },
  'product-search-v3': {
    includeSoldOut: 'boolean',
    keyword: 'string',
    page: 'number',
    sort: 'string',
    size: 'number',
  },
  'stock-goods-info-v3': { goodsNo: 'string' },
  'stock-stores': {
    productId: 'string',
    lat: 'number',
    lon: 'number',
    pageIdx: 'number',
    searchWords: 'string',
    mapLat: 'number',
    mapLon: 'number',
  },
};
const error = (status: number, message: string) => Response.json({ error: message }, { status });

export interface RelayEvent {
  stage: string;
  operation: string;
  outcome: string;
  requestId?: string;
  parentRequestId?: string;
  durationMs?: number;
}
export interface RelayOptions {
  takeQuota?: (() => Promise<boolean>) & { status?: () => QuotaStatus };
  onEvent?: (event: RelayEvent) => void | Promise<void>;
  status?: () => Record<string, unknown>;
}
export function createOliveyoungRelay(
  token: string,
  run: BrowserRunner,
  options: RelayOptions = {},
) {
  if (!token.trim()) throw new Error('OY_RELAY_TOKEN이 필요합니다.');
  const expected = Buffer.from(`Bearer ${token}`);
  const cache = createResponseCache();
  const consumers = createConsumerQuota();
  const consumerDenied = (busy = false) => Response.json({ error: 'Relay quota exceeded', reason: busy ? 'consumer-busy' : 'consumer' }, {
    status: 429,
    headers: { 'x-relay-quota-reason': busy ? 'consumer-busy' : 'consumer', 'retry-after': String(busy ? 1 : consumers.retryAfter()) },
  });
  const ttl: Record<string, number> = {
    'find-store': 300000,
    'product-search-v3': 300000,
    'stock-goods-info-v3': 600000,
    'stock-stores': 60000,
  };
  type Result = OliveyoungApiResponse | null | 'quota' | 'unavailable';
  const pending = new Map<
    string,
    {
      task: Promise<Result>;
      signals: Map<AbortSignal, number>;
      startedAt: number;
      requestId: string;
    }
  >();
  let outstanding = 0;
  let tail: Promise<unknown> = Promise.resolve();
  return async (request: Request): Promise<Response> => {
    const provided = Buffer.from(request.headers.get('authorization') || '');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
      return error(401, 'Unauthorized');
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health' && !url.search && options.status) {
      return Response.json({
        ...options.status(),
        outstanding,
        cache: cache.stats(),
        quota: options.takeQuota?.status?.(),
      });
    }
    if (!url.pathname.startsWith('/v1/oliveyoung/')) return error(404, 'Not found');
    const operation = url.pathname.slice('/v1/oliveyoung/'.length);
    if (request.method !== 'POST' || url.search || !Object.hasOwn(paths, operation))
      return error(404, 'Not found');
    // 느린 업로드도 슬롯을 점유하므로 본문 읽기 전에 상한을 검사합니다.
    if (outstanding >= 8) return error(503, 'Relay busy');
    const consumerHeader = request.headers.get('x-relay-consumer') || '';
    const consumer = /^[a-f0-9]{64}$/.test(consumerHeader) ? consumerHeader : 'legacy';
    const admission = consumers.enter(consumer);
    if (!admission) return consumerDenied(true);
    outstanding++;
    try {
      let body: Record<string, unknown>;
      try {
        const reader = request.body?.getReader();
        if (!reader) return error(400, 'JSON body required');
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 16384) {
            await reader.cancel();
            return error(413, 'Body too large');
          }
          chunks.push(next.value);
        }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const schema = fields[operation];
        if (
          !body ||
          Array.isArray(body) ||
          typeof body !== 'object' ||
          Object.keys(body).some((key) => !Object.hasOwn(schema, key)) ||
          Object.entries(schema).some(
            ([key, type]) =>
              typeof body[key] !== type || (type === 'number' && !Number.isFinite(body[key])),
          )
        )
          return error(400, 'Invalid payload');
      } catch {
        return error(400, 'Invalid JSON');
      }

      const suppliedId = request.headers.get('x-request-id');
      const requestId =
        suppliedId && /^[A-Za-z0-9_-]{1,64}$/.test(suppliedId) ? suppliedId : randomUUID();
      const started = Date.now();
      const emit = (stage: string, outcome: string, parentRequestId?: string) => {
        try {
          void Promise.resolve(
            options.onEvent?.({
              stage,
              operation,
              outcome,
              requestId,
              parentRequestId,
              durationMs: Date.now() - started,
            }),
          ).catch(() => undefined);
        } catch {
          /* 관측 실패는 요청 처리에 영향을 주지 않습니다. */
        }
      };
      const key = canonicalKey(operation, body);
      const cached = cache.get(key);
      if (cached !== undefined) {
        emit('cache', 'hit');
        return new Response(cached, {
          headers: { 'content-type': 'application/json', 'x-relay-cache': 'hit' },
        });
      }
      let entry = pending.get(key);
      const mode = entry ? 'coalesced' : 'miss';
      emit('cache', mode, entry?.requestId);
      const queuedAt = Date.now();
      if (!entry) {
        const reservation = admission.reserve();
        if (!reservation) return consumerDenied();
        const signals = new Map([[request.signal, queuedAt]]);
        const task = tail
          .then(async (): Promise<Result> => {
            entry!.startedAt = Date.now();
            if (
              [...signals].every(
                ([signal, arrived]) => signal.aborted || entry!.startedAt - arrived >= 30000,
              )
            )
              return null;
            if (options.takeQuota) {
              try {
                if (!(await options.takeQuota())) {
                  emit('quota', 'denied');
                  return 'quota';
                }
                emit('quota', 'consumed');
              } catch {
                emit('quota', 'unavailable');
                return 'unavailable';
              }
            }
            reservation.commit();
            const result = await run(paths[operation], body);
            if (result?.status === 'SUCCESS')
              cache.set(key, JSON.stringify(result), ttl[operation]);
            emit('upstream', result?.status === 'SUCCESS' ? 'success' : 'error');
            return result;
          })
          .finally(() => {
            pending.delete(key);
            reservation.release();
          });
        entry = { task, signals, startedAt: 0, requestId };
        pending.set(key, entry);
        tail = task.catch(() => undefined);
      } else {
        entry.signals.set(request.signal, queuedAt);
      }
      try {
        const result = await entry.task;
        if (request.signal.aborted || result === null || entry.startedAt - queuedAt >= 30000) {
          emit('queue', request.signal.aborted ? 'canceled' : 'expired');
          return error(503, 'Request expired');
        }
        if (result === 'quota') {
          const status = options.takeQuota?.status?.();
          return Response.json(
            { error: 'Relay quota exceeded', reason: status?.blockedBy || 'unknown' },
            {
              status: 429,
              headers: {
                'x-relay-quota-reason': status?.blockedBy || 'unknown',
                'retry-after': String(status?.retryAfter || 60),
              },
            },
          );
        }
        if (result === 'unavailable') return error(503, 'Relay quota unavailable');
        if (result?.status !== 'SUCCESS') return error(502, 'Upstream unavailable');
        return Response.json(result, { headers: { 'x-relay-cache': mode } });
      } catch {
        emit('upstream', 'error');
        return error(502, 'Upstream unavailable');
      } finally {
        entry.signals.delete(request.signal);
      }
    } finally {
      outstanding--;
      admission.release();
    }
  };
}
