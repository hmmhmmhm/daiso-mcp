/**
 * 올리브영 GET API 라우트 등록
 */

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
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 5,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'oliveyoung-products-v1',
      },
      () => handleOliveyoungSearchProducts(c),
    ),
  );

  app.get('/api/oliveyoung/stores', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60 * 24,
        staleWhileRevalidateSeconds: 60 * 5,
        keyPrefix: 'oliveyoung-stores-v1',
      },
      () => handleOliveyoungFindStores(c),
    ),
  );

  app.get('/api/oliveyoung/inventory', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'oliveyoung-inventory-v1',
      },
      () => handleOliveyoungCheckInventory(c),
    ),
  );
}
