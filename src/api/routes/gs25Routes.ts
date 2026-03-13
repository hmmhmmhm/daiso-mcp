/**
 * GS25 GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import type { AppBindings } from '../response.js';
import {
  handleGs25CheckInventory,
  handleGs25FindStores,
  handleGs25SearchProducts,
} from '../gs25Handlers.js';

export function registerGs25Routes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/gs25/stores', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'gs25-stores-v1',
      },
      () => handleGs25FindStores(c),
    ),
  );

  app.get('/api/gs25/products', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 3,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'gs25-products-v1',
      },
      () => handleGs25SearchProducts(c),
    ),
  );

  app.get('/api/gs25/inventory', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 2,
        staleWhileRevalidateSeconds: 30,
        keyPrefix: 'gs25-inventory-v1',
      },
      () => handleGs25CheckInventory(c),
    ),
  );
}
