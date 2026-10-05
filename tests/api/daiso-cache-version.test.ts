import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { registerDaisoRoutes } from '../../src/api/routes/daisoRoutes.js';
const { cache } = vi.hoisted(() => ({ cache: vi.fn() }));
vi.mock('../../src/utils/cache.js', () => ({ withEdgeCache: cache }));

describe('다이소 입력 검증 캐시 갱신', () => {
  it.each([['products?q=test', 'daiso-products-v3'], ['stores?keyword=test', 'daiso-stores-v3'], ['inventory?productId=1', 'daiso-inventory-v3']])('%s 이전 캐시를 재사용하지 않는다', async (path, keyPrefix) => {
    cache.mockReset().mockResolvedValue(new Response('{}'));
    const app = new Hono();
    registerDaisoRoutes(app);
    await app.request(`/api/daiso/${path}`);
    expect(cache).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ keyPrefix }), expect.any(Function));
  });
});
