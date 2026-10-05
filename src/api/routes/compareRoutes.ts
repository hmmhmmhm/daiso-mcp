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
        keyPrefix: 'compare-products-v3',
        shouldCache: async (response) => {
          try {
            const payload = await response.json() as {
              success?: unknown;
              data?: { results?: unknown; errors?: unknown };
            } | null;
            return response.ok && payload?.success === true &&
              Array.isArray(payload.data?.results) &&
              Array.isArray(payload.data?.errors) && payload.data.errors.length === 0;
          } catch {
            return false;
          }
        },
      },
      () => handleCompareProducts(c),
    ),
  );
}
