/**
 * 롯데시네마 GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import {
  handleLotteCinemaFindNearbyTheaters,
  handleLotteCinemaGetRemainingSeats,
  handleLotteCinemaListNowShowing,
} from '../lottecinemaHandlers.js';
import type { AppBindings } from '../response.js';

export function registerLotteCinemaRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/lottecinema/theaters', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60 * 24,
        staleWhileRevalidateSeconds: 60 * 5,
        keyPrefix: 'lottecinema-theaters-v1',
      },
      () => handleLotteCinemaFindNearbyTheaters(c),
    ),
  );

  app.get('/api/lottecinema/movies', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'lottecinema-movies-v1',
      },
      () => handleLotteCinemaListNowShowing(c),
    ),
  );

  app.get('/api/lottecinema/seats', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 3,
        staleWhileRevalidateSeconds: 30,
        keyPrefix: 'lottecinema-seats-v1',
      },
      () => handleLotteCinemaGetRemainingSeats(c),
    ),
  );
}
