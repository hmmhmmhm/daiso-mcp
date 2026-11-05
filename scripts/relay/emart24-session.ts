/** 이마트24 공개 재고 화면에서 발급하는 익명 HTTP 세션만 짧게 재사용합니다. */
import { EMART24_API } from '../../src/services/emart24/api.js';
import { RelayPolicyQuotaError, type HttpRelayOptions } from './http-relay.js';

const origin = EMART24_API.EVERSE_BASE_URL;
const page = origin + EMART24_API.PRODUCT_SEARCH_PATH;
const paths = new Set<string>([
  EMART24_API.PRODUCT_SEARCH_PATH,
  EMART24_API.STOCK_SEARCH_STORE_PATH,
]);

export function createEmart24SessionTransport(options: {
  fetcher?: typeof fetch;
  takeQuota: HttpRelayOptions['takeQuota'];
}) {
  const fetcher = options.fetcher ?? fetch;
  let cookie = '';
  let expiresAt = 0;
  const charge = async (signal?: AbortSignal | null) => {
    signal?.throwIfAborted();
    if (!(await options.takeQuota())) {
      const quota = options.takeQuota.status?.();
      throw new RelayPolicyQuotaError(
        quota?.blockedBy === 'minute' || quota?.blockedBy === 'daily'
          ? { quotaReason: quota.blockedBy, retryAfter: quota.retryAfter }
          : undefined,
      );
    }
    signal?.throwIfAborted();
  };
  const run: typeof globalThis.fetch = async (input, init) => {
    if (input instanceof Request) return fetcher(input, init);
    const url = new URL(input);
    if (url.origin !== origin || !paths.has(url.pathname)) return fetcher(input, init);
    init?.signal?.throwIfAborted();
    const headers = new Headers(init?.headers);
    if (Date.now() >= expiresAt) cookie = '';
    if (cookie) headers.set('Cookie', cookie);
    const response = await fetcher(input, { ...init, headers });
    if (response.status !== 403) return response;
    await response.body?.cancel().catch(() => undefined);
    await charge(init?.signal);
    const warm = await fetcher(page, { method: 'GET', redirect: 'manual', signal: init?.signal });
    await warm.body?.cancel();
    const session = warm.headers
      .getSetCookie()
      .map((value) => /^JSESSIONID=([A-Za-z0-9._-]{1,256})(?:;|$)/.exec(value)?.[1])
      .find(Boolean);
    if (warm.status !== 200 || !session) return response;
    cookie = 'JSESSIONID=' + session;
    expiresAt = Date.now() + 600000;
    await charge(init?.signal);
    headers.set('Cookie', cookie);
    return fetcher(input, { ...init, headers });
  };
  return { fetch: run };
}
