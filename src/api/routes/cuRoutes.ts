/**
 * CU GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import { handleCuFindStores, handleCuCheckInventory } from '../handlers.js';
import type { AppBindings } from '../response.js';

export function registerCuRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/cu/stores', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60 * 24,
        staleWhileRevalidateSeconds: 60 * 5,
        keyPrefix: 'cu-stores-v4',
      },
      () => handleCuFindStores(c),
    ),
  );

  app.get('/api/cu/inventory', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'cu-inventory-v4',
      },
      () => handleCuCheckInventory(c),
    ),
  );
}
