/**
 * 세븐일레븐 GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import type { AppBindings } from '../response.js';
import {
  handleSevenElevenGetCatalogSnapshot,
  handleSevenElevenGetSearchPopwords,
  handleSevenElevenSearchProducts,
} from '../sevenelevenHandlers.js';

export function registerSevenElevenRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/seveneleven/products', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 3,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'seveneleven-products-v1',
      },
      () => handleSevenElevenSearchProducts(c),
    ),
  );

  app.get('/api/seveneleven/popwords', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 5,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'seveneleven-popwords-v1',
      },
      () => handleSevenElevenGetSearchPopwords(c),
    ),
  );

  app.get('/api/seveneleven/catalog', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 5,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'seveneleven-catalog-v1',
      },
      () => handleSevenElevenGetCatalogSnapshot(c),
    ),
  );
}
