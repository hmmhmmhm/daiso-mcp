import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import {
  handleOpinetAveragePrices,
  handleOpinetLowestStations,
  handleOpinetStationDetail,
  handleOpinetStationsAround,
} from '../opinetHandlers.js';
import type { AppBindings } from '../response.js';

export function registerOpinetRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/opinet/average', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60,
        staleWhileRevalidateSeconds: 60 * 30,
        keyPrefix: 'opinet-average-v1',
      },
      () => handleOpinetAveragePrices(c),
    ),
  );

  app.get('/api/opinet/lowest', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 30,
        staleWhileRevalidateSeconds: 60 * 10,
        keyPrefix: 'opinet-lowest-v1',
      },
      () => handleOpinetLowestStations(c),
    ),
  );

  app.get('/api/opinet/stations/around', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 20,
        staleWhileRevalidateSeconds: 60 * 5,
        keyPrefix: 'opinet-around-v1',
      },
      () => handleOpinetStationsAround(c),
    ),
  );

  app.get('/api/opinet/station', async (c) =>
    withEdgeCache(
      c.req.url,
      {
        ttlSeconds: 60 * 60,
        staleWhileRevalidateSeconds: 60 * 10,
        keyPrefix: 'opinet-station-v1',
      },
      () => handleOpinetStationDetail(c),
    ),
  );
}
