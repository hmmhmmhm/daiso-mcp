/**
 * 세븐일레븐 GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import { shouldCacheSevenElevenInventory } from '../../services/seveneleven/inventoryCache.js';
import type { AppBindings } from '../response.js';
import {
  handleSevenElevenCheckInventory,
  handleSevenElevenGetCatalogSnapshot,
  handleSevenElevenGetSearchPopwords,
  handleSevenElevenSearchStores,
  handleSevenElevenSearchProducts,
} from '../sevenelevenHandlers.js';

export function registerSevenElevenRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/seveneleven/products', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 3,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'seveneleven-products-v4',
      },
      () => handleSevenElevenSearchProducts(c),
    ),
  );

  app.get('/api/seveneleven/stores', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 3,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'seveneleven-stores-v2',
      },
      () => handleSevenElevenSearchStores(c),
    ),
  );

  app.get('/api/seveneleven/inventory', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 30,
        staleWhileRevalidateSeconds: 0,
        keyPrefix: 'seveneleven-inventory-v3',
        shouldCache: shouldCacheSevenElevenInventory,
      },
      () => handleSevenElevenCheckInventory(c),
    ),
  );

  app.get('/api/seveneleven/popwords', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 5,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'seveneleven-popwords-v2',
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
        keyPrefix: 'seveneleven-catalog-v2',
      },
      () => handleSevenElevenGetCatalogSnapshot(c),
    ),
  );
}
