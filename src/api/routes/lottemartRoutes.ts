/**
 * 롯데마트 GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import { handleLotteMartFindStores, handleLotteMartSearchProducts } from '../lottemartHandlers.js';
import type { AppBindings } from '../response.js';

export function registerLotteMartRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/lottemart/stores', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 30,
        staleWhileRevalidateSeconds: 60 * 3,
        keyPrefix: 'lottemart-stores-v1',
      },
      () => handleLotteMartFindStores(c),
    ),
  );

  app.get('/api/lottemart/products', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 5,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'lottemart-products-v1',
      },
      () => handleLotteMartSearchProducts(c),
    ),
  );
}
