import { isFreshOperationalRequest } from '../operationalFreshness.js';
/**
 * 올리브영 GET API 라우트 등록
 */

import { oliveyoungCacheKey } from '../../utils/oliveyoungCacheKey.js';
import type { Hono } from 'hono';
import { withEdgeCache } from '../../utils/cache.js';
import {
  handleOliveyoungFindStores,
  handleOliveyoungCheckInventory,
  handleOliveyoungSearchProducts,
} from '../handlers.js';
import type { AppBindings } from '../response.js';
import { handleOliveyoungGetTodayDeals } from '../oliveyoungTodayDealsHandler.js';
import { toKstDate } from '../../services/oliveyoung/todayDeals.js';

export function registerOliveyoungRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/oliveyoung/products', async (c) =>
    (await isFreshOperationalRequest(c))
      ? handleOliveyoungSearchProducts(c)
      : withEdgeCache(
          oliveyoungCacheKey(c.req.url),
          {
            ttlSeconds: 60 * 5,
            staleWhileRevalidateSeconds: 60,
            keyPrefix: 'oliveyoung-products-v3',
          },
          () => handleOliveyoungSearchProducts(c),
        ),
  );

  app.get('/api/oliveyoung/stores', async (c) =>
    (await isFreshOperationalRequest(c))
      ? handleOliveyoungFindStores(c)
      : withEdgeCache(
          oliveyoungCacheKey(c.req.url),
          {
            ttlSeconds: 60 * 60 * 24,
            staleWhileRevalidateSeconds: 60 * 5,
            keyPrefix: 'oliveyoung-stores-v3',
          },
          () => handleOliveyoungFindStores(c),
        ),
  );

  app.get('/api/oliveyoung/inventory', async (c) =>
    (await isFreshOperationalRequest(c))
      ? handleOliveyoungCheckInventory(c)
      : withEdgeCache(
          oliveyoungCacheKey(c.req.url),
          {
            ttlSeconds: 60 * 10,
            staleWhileRevalidateSeconds: 60,
            keyPrefix: 'oliveyoung-inventory-v4',
          },
          () => handleOliveyoungCheckInventory(c),
        ),
  );

  // 오특은 한국 자정에 바뀌므로 날짜를 캐시 키에 넣어 자정 전후 응답이 섞이지 않게 합니다.
  app.get('/api/oliveyoung/today-deals', async (c) =>
    withEdgeCache(
      oliveyoungCacheKey(c.req.url),
      {
        bypassCache: await isFreshOperationalRequest(c),
        ttlSeconds: 60 * 5,
        staleWhileRevalidateSeconds: 60,
        keyPrefix: `oliveyoung-today-deals-v1-${toKstDate(new Date())}`,
      },
      () => handleOliveyoungGetTodayDeals(c),
    ),
  );
}
