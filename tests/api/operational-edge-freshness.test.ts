import { afterEach, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { registerSevenElevenRoutes } from '../../src/api/routes/sevenelevenRoutes.js';
import { registerGs25Routes } from '../../src/api/routes/gs25Routes.js';
import { registerCuRoutes } from '../../src/api/routes/cuRoutes.js';
import { registerCgvRoutes } from '../../src/api/routes/cgvRoutes.js';
import type { AppBindings } from '../../src/api/response.js';
const { handler } = vi.hoisted(() => ({
  handler: vi.fn(async () => Response.json({ source: 'upstream' })),
}));
vi.mock('../../src/api/sevenelevenHandlers.js', () => ({
  handleSevenElevenSearchProducts: handler,
  handleSevenElevenSearchStores: handler,
  handleSevenElevenCheckInventory: handler,
  handleSevenElevenGetSearchPopwords: handler,
  handleSevenElevenGetCatalogSnapshot: handler,
}));
vi.mock('../../src/api/gs25Handlers.js', () => ({
  handleGs25FindStores: handler,
  handleGs25SearchProducts: handler,
  handleGs25CheckInventory: handler,
}));
vi.mock('../../src/api/handlers.js', () => ({
  handleCuFindStores: handler,
  handleCuCheckInventory: handler,
}));
vi.mock('../../src/api/cgvHandlers.js', () => ({
  handleCgvFindTheaters: handler,
  handleCgvSearchMovies: handler,
  handleCgvGetTimetable: handler,
}));
afterEach(() => vi.unstubAllGlobals());
it.each([
  [registerSevenElevenRoutes, '/api/seveneleven/products'],
  [registerGs25Routes, '/api/gs25/products'],
  [registerCuRoutes, '/api/cu/stores'],
  [registerCgvRoutes, '/api/cgv/theaters'],
])('인증된 fresh 요청만 따뜻한 Edge 캐시를 우회한다 %s', async (register, path) => {
  const match = vi.fn(async () => Response.json({ source: 'cached' }));
  const put = vi.fn();
  vi.stubGlobal('caches', { default: { match, put } });
  const app = new Hono<{ Bindings: AppBindings }>();
  register(app);
  const env = { HEALTH_CHECK_SECRET: 'secret' };
  expect(await (await app.request(path, undefined, env)).json()).toEqual({ source: 'cached' });
  const fresh = await app.request(
    path,
    { headers: { 'x-health-check-key': 'secret', 'x-health-check-force-fresh': 'true' } },
    env,
  );
  expect(await fresh.json()).toEqual({ source: 'upstream' });
  expect(fresh.headers.get('Cache-Control')).toBe('no-store');
  expect(match).toHaveBeenCalledTimes(1);
  expect(put).not.toHaveBeenCalled();
  const invalid = await app.request(
    path,
    { headers: { 'x-health-check-key': 'wrong', 'x-health-check-force-fresh': 'true' } },
    env,
  );
  expect(await invalid.json()).toEqual({ source: 'cached' });
});
