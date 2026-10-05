/**
 * 이마트24 GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import {
  handleEmart24CheckInventory,
  handleEmart24FindStores,
  handleEmart24SearchProducts,
} from '../emart24Handlers.js';
import type { AppBindings } from '../response.js';

export function registerEmart24Routes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/emart24/stores', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 30,
        staleWhileRevalidateSeconds: 60 * 3,
        keyPrefix: 'emart24-stores-v2',
      },
      () => handleEmart24FindStores(c),
    ),
  );

  app.get('/api/emart24/products', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'emart24-products-v2',
      },
      () => handleEmart24SearchProducts(c),
    ),
  );

  app.get('/api/emart24/inventory', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 5,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'emart24-inventory-v2',
      },
      () => handleEmart24CheckInventory(c),
    ),
  );
}
