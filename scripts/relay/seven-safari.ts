/** 세븐 공개 HTTP가 차단된 경우에만 Safari 동일 출처 조회를 한 번 실행합니다. */
import { SEVENELEVEN_API } from '../../src/services/seveneleven/api.js';
import { createSafariLifecycle } from './safari-lifecycle.js';
import { RelayError, type HttpRelayOptions } from './http-relay.js';
const origin = SEVENELEVEN_API.BASE_URL;
const paths = new Set([
  ...Object.values(SEVENELEVEN_API).filter((path) => path.startsWith('/api/')),
  `${SEVENELEVEN_API.REAL_STOCK_MULTI_PATH}/01/stocks`,
]);
export type SevenSafariOutcome =
  | 'safari-success'
  | 'safari-http-403'
  | 'safari-http-429'
  | 'safari-http-other'
  | 'safari-fallback-error'
  | 'safari-skipped-cooldown'
  | 'safari-quota-rejected';

export async function browserFetch(args: {
  origin: string;
  path: string;
  method: string;
  body: string | null;
}) {
  const r = await fetch(args.origin + args.path, {
    method: args.method,
    body: args.body,
    credentials: 'include',
    redirect: 'error',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    signal: AbortSignal.timeout(10000),
  });
  const reader = r.body?.getReader();
  if (!reader) return { status: r.status, text: '', retryAfter: r.headers.get('retry-after') };
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('response-size');
    }
    parts.push(chunk.value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return {
    status: r.status,
    text: new TextDecoder().decode(output),
    retryAfter: r.headers.get('retry-after'),
  };
}
export function createSevenSafariTransport(
  stateDir: string,
  options: {
    fetcher?: typeof fetch;
    takeQuota: HttpRelayOptions['takeQuota'];
    onEvent?: (outcome: SevenSafariOutcome) => void;
  },
) {
  const fetcher = options.fetcher ?? fetch;
  const report = (outcome: SevenSafariOutcome) => {
    try {
      options.onEvent?.(outcome);
    } catch {
      // 진단 기록 실패는 Safari 요청을 바꾸지 않습니다.
    }
  };
  let state = 'idle';
  let retryAt = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const run: typeof fetch = async (input, init) => {
    if (input instanceof Request) return fetcher(input, init);
    const url = new URL(input);
    if (url.origin !== origin || !paths.has(url.pathname)) return fetcher(input, init);
    const response = await fetcher(input, init);
    if (response.status !== 403) return response;
    if (Date.now() < retryAt) {
      report('safari-skipped-cooldown');
      return response;
    }
    const task = tail.then(async () => {
      if (Date.now() < retryAt) {
        report('safari-skipped-cooldown');
        return response;
      }
      await response.body?.cancel();
      init?.signal?.throwIfAborted();
      if (init?.body != null && typeof init.body !== 'string')
        throw new Error('Safari JSON body required');
      const lifecycle = createSafariLifecycle(stateDir);
      const abort = () => {
        void lifecycle.close();
      };
      init?.signal?.addEventListener('abort', abort, { once: true });
      const previousState = state;
      state = 'preparing';
      try {
        try {
          await lifecycle.start();
        } catch (error) {
          init?.signal?.throwIfAborted();
          report('safari-fallback-error');
          state = 'failed';
          retryAt = Date.now() + 60000;
          throw error;
        }
        init?.signal?.throwIfAborted();
        const allowed = await options.takeQuota();
        init?.signal?.throwIfAborted();
        if (!allowed) {
          report('safari-quota-rejected');
          const quota = options.takeQuota.status?.();
          throw new RelayError(
            429,
            undefined,
            quota?.blockedBy === 'minute' || quota?.blockedBy === 'daily'
              ? { quotaReason: quota.blockedBy, retryAfter: quota.retryAfter }
              : undefined,
          );
        }
        try {
          const value = (await lifecycle.evaluate(String(browserFetch), {
            origin,
            path: url.pathname + url.search,
            method: init?.method ?? 'GET',
            body: typeof init?.body === 'string' ? init.body : null,
          })) as { status?: unknown; text?: unknown; retryAfter?: string; reason?: string } | null;
          if (
            !value ||
            typeof value.status !== 'number' ||
            !Number.isInteger(value.status) ||
            value.status < 200 ||
            value.status > 599 ||
            typeof value.text !== 'string' ||
            value.reason
          )
            throw new Error('Invalid Safari response');
          const headers = new Headers({ 'Content-Type': 'application/json' });
          if (value.retryAfter) headers.set('Retry-After', value.retryAfter);
          const result = new Response(value.status === 204 ? null : value.text, {
            status: value.status,
            headers,
          });
          report(
            value.status === 200
              ? 'safari-success'
              : value.status === 403
                ? 'safari-http-403'
                : value.status === 429
                  ? 'safari-http-429'
                  : 'safari-http-other',
          );
          state = value.status === 200 ? 'ready' : 'failed';
          if (value.status === 403 || value.status === 429) retryAt = Date.now() + 60000;
          return result;
        } catch (error) {
          report('safari-fallback-error');
          state = 'failed';
          retryAt = Date.now() + 60000;
          throw error;
        }
      } finally {
        init?.signal?.removeEventListener('abort', abort);
        try {
          await lifecycle.close();
        } finally {
          if (state === 'preparing') state = previousState;
        }
      }
    });
    tail = task.catch(() => undefined);
    return task;
  };
  return { fetch: run, status: () => ({ state, transport: 'safari', retryAt }) };
}
