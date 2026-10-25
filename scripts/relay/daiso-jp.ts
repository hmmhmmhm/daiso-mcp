/** 고정 일본 다이소 상품 JSON만 제공하며 임의 URL을 받지 않습니다. */
import { parseProductDetail } from '../../src/services/daisoJp/parser.js';
import { parseRetryAfterDelayMs } from '../../src/utils/http.js';
import {
  createHttpRelay,
  RelayError,
  abortable,
  readJson,
  type HttpRelayOptions,
} from './http-relay.js';
export function createJapanProductRelay(
  token: string,
  options: Pick<HttpRelayOptions, 'takeQuota' | 'fetcher' | 'onEvent'>,
) {
  let blockedUntil = 0;
  return createHttpRelay(token, {
    ...options,
    prefix: '/v1/dtryx/',
    operations: ['daiso-jp-product'],
    cacheTtl: () => 1800000,
    validate(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RelayError(400);
      const p = value as Record<string, unknown>;
      if (Object.keys(p).length !== 1 || typeof p.id !== 'string' || !/^\d{13}$/.test(p.id))
        throw new RelayError(400);
      return { id: p.id };
    },
    async upstream(_operation, value, signal, fetcher) {
      // 원본 제한은 품절이나 자체 할당량으로 바꾸지 않고 모든 상품에 대기를 공유합니다.
      if (Date.now() < blockedUntil) throw new RelayError(502, undefined, undefined, 429);
      const { id } = value as { id: string };
      const response = await abortable(
        fetcher(new URL(`https://jp.daisonet.com/products/${id}.js`), {
          redirect: 'manual',
          signal,
        }),
        signal,
      );
      if (response.status === 429)
        blockedUntil =
          Date.now() +
          Math.max(1000, Math.min(parseRetryAfterDelayMs(response) ?? 60000, 86400000));
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => undefined);
        throw new RelayError(502, undefined, undefined, response.status);
      }
      const data = await readJson(response.body, 2 * 1024 * 1024, signal, 502);
      parseProductDetail(data, id);
      return data;
    },
  });
}
