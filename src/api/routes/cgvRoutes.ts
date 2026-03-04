/**
 * CGV GET API 라우트 등록
 */

import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import { handleCgvFindTheaters, handleCgvGetTimetable, handleCgvSearchMovies } from '../cgvHandlers.js';
import type { AppBindings } from '../response.js';

export function registerCgvRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/cgv/theaters', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60 * 24,
        staleWhileRevalidateSeconds: 60 * 5,
        keyPrefix: 'cgv-theaters-v1',
      },
      () => handleCgvFindTheaters(c),
    ),
  );

  app.get('/api/cgv/movies', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 10,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: 'cgv-movies-v1',
      },
      () => handleCgvSearchMovies(c),
    ),
  );

  app.get('/api/cgv/timetable', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 3,
        staleWhileRevalidateSeconds: 30,
        keyPrefix: 'cgv-timetable-v1',
      },
      () => handleCgvGetTimetable(c),
    ),
  );
}
