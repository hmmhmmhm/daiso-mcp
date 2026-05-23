/**
 * 장소 검색 GET API 라우트 등록
 */
import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import type { AppBindings } from '../response.js';
import { handlePlacesSearch } from '../placesHandlers.js';

export function registerPlacesRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/places/search', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60,
        staleWhileRevalidateSeconds: 60 * 10,
        keyPrefix: 'places-search-v1',
      },
      () => handlePlacesSearch(c),
    ),
  );
}
