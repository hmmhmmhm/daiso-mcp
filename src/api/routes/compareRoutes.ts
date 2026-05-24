import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import { handleCompareProducts } from '../compareHandlers.js';
import type { AppBindings } from '../response.js';

export function registerCompareRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/compare/products', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'compare-products-v1',
      },
      () => handleCompareProducts(c),
    ),
  );
}
