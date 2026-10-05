import { canonicalKey, createResponseCache } from './cache.js';
/** 공개 API 중계의 인증·용량·기한·동시성 제한입니다. */
import { randomUUID, timingSafeEqual } from 'node:crypto';
export interface HttpRelayOptions {
  cacheTtl?: (operation: string) => number;
  prefix: string;
  operations: string[];
  validate: (value: unknown, operation: string) => unknown;
  upstream: (
    operation: string,
    params: unknown,
    signal: AbortSignal,
    fetcher: typeof fetch,
  ) => Promise<unknown>;
  takeQuota: () => Promise<boolean>;
  fetcher?: typeof fetch;
  onEvent?: (event: {
    stage: string;
    operation: string;
    requestId: string;
    outcome: string;
    status: number;
    durationMs: number;
  }) => void | Promise<void>;
}
export class RelayError extends Error {
  constructor(readonly status: number) {
    super('Relay failure');
  }
}
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

/** 취소 신호를 무시하는 외부 처리도 기한 안에 반환합니다. */
export function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new RelayError(499));
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) {
      reject(new RelayError(499));
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function readJson(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
  status: number,
): Promise<unknown> {
  if (!body) throw new RelayError(status);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new RelayError(status === 400 ? 413 : status);
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof RelayError) throw error;
    throw new RelayError(status);
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

export function createHttpRelay(token: string, options: HttpRelayOptions) {
  if (!token.trim()) throw new Error('Relay token is required');
  const secret = Buffer.from(`Bearer ${token}`);
  const fetcher = options.fetcher ?? fetch;
  const cache = options.cacheTtl ? createResponseCache() : undefined;
  let outstanding = 0;
  let active = 0;
  const queue: Array<() => void> = [];
  function acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new RelayError(499));
    if (active < 4) {
      active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const start = () => {
        signal.removeEventListener('abort', abort);
        active++;
        resolve();
      };
      const abort = () => {
        queue.splice(queue.indexOf(start), 1);
        reject(new RelayError(499));
      };
      signal.addEventListener('abort', abort, { once: true });
      queue.push(start);
    });
  }
  return async (request: Request): Promise<Response> => {
    const authorization = Buffer.from(request.headers.get('authorization') ?? '');
    if (authorization.length !== secret.length || !timingSafeEqual(authorization, secret))
      return reply(401, { error: 'Unauthorized' });
    const url = new URL(request.url);
    if (url.pathname === `${options.prefix}health` && request.method === 'GET' && !url.search)
      return reply(200, { status: 'ok', active, outstanding, queued: queue.length });
    const name = url.pathname.slice(options.prefix.length);
    if (
      !url.pathname.startsWith(options.prefix) ||
      !options.operations.includes(name) ||
      url.search
    )
      return reply(404, { error: 'Not found' });
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
    if (outstanding >= 32) return reply(503, { error: 'Relay busy' });
    outstanding++;
    const deadline = performance.now() + 15000;
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      abort();
    }, 15000);
    let acquired = false;
    let stage = 'body';
    let resultStatus = 200;
    const suppliedId = request.headers.get('x-request-id');
    const requestId =
      suppliedId && /^[A-Za-z0-9_-]{1,64}$/.test(suppliedId) ? suppliedId : randomUUID();
    try {
      const p = options.validate(await readJson(request.body, 16384, controller.signal, 400), name);
      const key = canonicalKey(name, p as Record<string, unknown>);
      const cached = cache?.get(key);
      if (cached !== undefined) {
        controller.signal.throwIfAborted();
        stage = 'cache';
        return new Response(cached, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
      stage = 'queue';
      await acquire(controller.signal);
      acquired = true;
      if (performance.now() >= deadline) {
        expired = true;
        abort();
      }
      controller.signal.throwIfAborted();
      stage = 'quota';
      if (
        !(await abortable(
          options.takeQuota().catch(() => {
            throw new RelayError(503);
          }),
          controller.signal,
        ))
      )
        throw new RelayError(429);
      controller.signal.throwIfAborted();
      stage = 'upstream';
      const data = await options.upstream(name, p, controller.signal, fetcher);
      if (cache) cache.set(key, JSON.stringify(data), options.cacheTtl!(name));
      return reply(200, data);
    } catch (error) {
      const status = expired
        ? 504
        : controller.signal.aborted
          ? 499
          : error instanceof RelayError
            ? error.status
            : 502;
      resultStatus = status;
      return reply(status, { error: 'Relay request failed' });
    } finally {
      try {
        void Promise.resolve(
          options.onEvent?.({
            stage,
            operation: name,
            requestId,
            outcome: resultStatus === 200 ? 'ok' : 'error',
            status: resultStatus,
            durationMs: performance.now() - deadline + 15000,
          }),
        ).catch(() => undefined);
      } catch {
        /* 관측 실패는 요청에 영향을 주지 않습니다. */
      }
      clearTimeout(timer);
      request.signal.removeEventListener('abort', abort);
      controller.abort();
      outstanding--;
      if (acquired) {
        active--;
        queue.shift()?.();
      }
    }
  };
}
