/** 고정 일본 다이소 상품 JSON·검색 HTML만 제공하며 임의 URL을 받지 않습니다. */
import * as z from 'zod';
import { parseProductDetail, parseProductSearch } from '../../src/services/daisoJp/parser.js';
import { parseRetryAfterDelayMs } from '../../src/utils/http.js';
import {
  createHttpRelay,
  RelayError,
  abortable,
  readJson,
  readText,
  type HttpRelayOptions,
} from './http-relay.js';
export function createJapanProductRelay(
  token: string,
  options: Pick<HttpRelayOptions, 'takeQuota' | 'fetcher' | 'onEvent'>,
) {
  const blockedUntil = { product: 0, search: 0 };
  const product = z.object({ id: z.string().regex(/^\d{13}$/) }).strict();
  const search = z
    .object({ query: z.string().trim().min(1).max(100), page: z.number().int().min(1).max(100) })
    .strict();
  let upstreamTail = Promise.resolve();
  const relay = createHttpRelay(token, {
    ...options,
    prefix: '/v1/dtryx/',
    operations: ['daiso-jp-product', 'daiso-jp-search'],
    cacheTtl: () => 1800000,
    validate(value, operation) {
      const result = (operation === 'daiso-jp-search' ? search : product).safeParse(value);
      if (!result.success) throw new RelayError(400);
      return result.data;
    },
    async upstream(operation, value, signal, fetcher) {
      const key = operation === 'daiso-jp-search' ? 'search' : 'product';
      // 서로 다른 상품도 한 원본 진입을 공유하고 대기 중 취소를 보존합니다.
      const previous = upstreamTail;
      let release!: () => void;
      const turn = new Promise<void>((resolve) => {
        release = resolve;
      });
      upstreamTail = previous.then(() => turn);
      try {
        await abortable(previous, signal);
        signal.throwIfAborted();
        // 원본 제한은 품절이나 자체 할당량으로 바꾸지 않고 같은 작업의 모든 입력에 대기를 공유합니다.
        if (Date.now() < blockedUntil[key]) throw new RelayError(429, undefined, undefined, 429);
        const target = new URL('https://jp.daisonet.com/search');
        if (key === 'product') target.pathname = `/products/${product.parse(value).id}.js`;
        else {
          const p = search.parse(value);
          target.search = new URLSearchParams({
            q: p.query,
            type: 'product',
            page: String(p.page),
          }).toString();
        }
        const response = await abortable(
          fetcher(target, {
            redirect: 'manual',
            signal,
          }),
          signal,
        );
        if (response.status === 429)
          blockedUntil[key] =
            Date.now() +
            Math.max(1000, Math.min(parseRetryAfterDelayMs(response) ?? 60000, 86400000));
        if (response.status !== 200) {
          void response.body?.cancel().catch(() => undefined);
          throw new RelayError(
            response.status === 429 ? 429 : 502,
            undefined,
            undefined,
            response.status,
          );
        }
        if (key === 'search') {
          const html = await readText(response.body, 2 * 1024 * 1024, signal, 502);
          parseProductSearch(html);
          return { html };
        }
        const data = await readJson(response.body, 2 * 1024 * 1024, signal, 502);
        parseProductDetail(data, product.parse(value).id);
        return data;
      } finally {
        release();
      }
    },
  });
  return async (request: Request) => {
    const response = await relay(request);
    if (response.status === 429 && response.headers.get('x-relay-upstream-status') === '429')
      response.headers.set(
        'Retry-After',
        String(
          Math.max(
            1,
            Math.ceil(
              (blockedUntil[
                new URL(request.url).pathname.endsWith('search') ? 'search' : 'product'
              ] -
                Date.now()) /
                1000,
            ),
          ),
        ),
      );
    return response;
  };
}
