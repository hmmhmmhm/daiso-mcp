import { isFreshOperationalRequest } from '../operationalFreshness.js';
/**
 * 올리브영 GET API 라우트 등록
 */

import { oliveyoungCacheKey } from '../../utils/oliveyoungCacheKey.js';
import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import {
  handleOliveyoungFindStores,
  handleOliveyoungCheckInventory,
  handleOliveyoungSearchProducts,
} from '../handlers.js';
import type { AppBindings } from '../response.js';

export function registerOliveyoungRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/oliveyoung/products', async (c) =>
    (await isFreshOperationalRequest(c))
      ? handleOliveyoungSearchProducts(c)
      : withEdgeCache(
          oliveyoungCacheKey(c.req.url),
          {
            ttlSeconds: 60 * 5,
            staleWhileRevalidateSeconds: 60,
            keyPrefix: 'oliveyoung-products-v3',
          },
          () => handleOliveyoungSearchProducts(c),
        ),
  );

  app.get('/api/oliveyoung/stores', async (c) =>
    (await isFreshOperationalRequest(c))
      ? handleOliveyoungFindStores(c)
      : withEdgeCache(
          oliveyoungCacheKey(c.req.url),
          {
            ttlSeconds: 60 * 60 * 24,
            staleWhileRevalidateSeconds: 60 * 5,
            keyPrefix: 'oliveyoung-stores-v3',
          },
          () => handleOliveyoungFindStores(c),
        ),
  );

  app.get('/api/oliveyoung/inventory', async (c) =>
    (await isFreshOperationalRequest(c))
      ? handleOliveyoungCheckInventory(c)
      : withEdgeCache(
          oliveyoungCacheKey(c.req.url),
          {
            ttlSeconds: 60 * 10,
            staleWhileRevalidateSeconds: 60,
            keyPrefix: 'oliveyoung-inventory-v4',
          },
          () => handleOliveyoungCheckInventory(c),
        ),
  );
}
