/**
 * 디트릭스 GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import {
  handleDtryxGetRemainingSeats,
  handleDtryxListCinemas,
  handleDtryxListNowShowing,
} from '../dtryxHandlers.js';
import type { AppBindings } from '../response.js';

export function registerDtryxRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/dtryx/cinemas', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60 * 24,
        staleWhileRevalidateSeconds: 60 * 5,
        keyPrefix: 'dtryx-cinemas-v1',
      },
      () => handleDtryxListCinemas(c),
    ),
  );

  app.get('/api/dtryx/movies', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'dtryx-movies-v1',
      },
      () => handleDtryxListNowShowing(c),
    ),
  );

  app.get('/api/dtryx/seats', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 3,
        staleWhileRevalidateSeconds: 30,
        keyPrefix: 'dtryx-seats-v1',
      },
      () => handleDtryxGetRemainingSeats(c),
    ),
  );
}
