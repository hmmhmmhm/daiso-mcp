/** 고정 일본 다이소 상품 JSON만 제공하며 임의 URL을 받지 않습니다. */
import { parseProductDetail } from '../../src/services/daisoJp/parser.js';
import { createHttpRelay, RelayError, abortable, readJson, type HttpRelayOptions } from './http-relay.js';
export function createJapanProductRelay(token: string, options: Pick<HttpRelayOptions, 'takeQuota' | 'fetcher' | 'onEvent'>) {
 return createHttpRelay(token, {
  ...options, prefix: '/v1/daiso-jp/', operations: ['product'], cacheTtl: () => 1800000,
  validate(value) {
   if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RelayError(400);
   const p = value as Record<string, unknown>;
   if (Object.keys(p).length !== 1 || typeof p.id !== 'string' || !/^\d{13}$/.test(p.id)) throw new RelayError(400);
   return { id: p.id };
  },
  async upstream(_operation, value, signal, fetcher) {
   const { id } = value as { id: string };
   const response = await abortable(fetcher(new URL(`https://jp.daisonet.com/products/${id}.js`), { redirect: 'manual', signal }), signal);
   if (response.status !== 200) { void response.body?.cancel().catch(() => undefined); throw new RelayError(502, undefined, undefined, response.status); }
   const data = await readJson(response.body, 2 * 1024 * 1024, signal, 502);
   parseProductDetail(data, id);
   return data;
  },
 });
}
