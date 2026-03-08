/**
 * 다이소 GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import {
  handleSearchProducts,
  handleGetProduct,
  handleFindStores,
  handleCheckInventory,
  handleGetDisplayLocation,
} from '../handlers.js';
import type { AppBindings } from '../response.js';

export function registerDaisoRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/daiso/products', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 30,
        staleWhileRevalidateSeconds: 60 * 3,
        keyPrefix: 'daiso-products-v1',
      },
      () => handleSearchProducts(c),
    ),
  );

  app.get('/api/daiso/products/:id', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60,
        staleWhileRevalidateSeconds: 60 * 5,
        keyPrefix: 'daiso-product-detail-v1',
      },
      () => handleGetProduct(c),
    ),
  );

  app.get('/api/daiso/stores', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60 * 24,
        staleWhileRevalidateSeconds: 60 * 5,
        keyPrefix: 'daiso-stores-v1',
      },
      () => handleFindStores(c),
    ),
  );

  app.get('/api/daiso/inventory', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'daiso-inventory-v1',
      },
      () => handleCheckInventory(c),
    ),
  );

  app.get('/api/daiso/display-location', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'daiso-display-location-v1',
      },
      () => handleGetDisplayLocation(c),
    ),
  );
}
