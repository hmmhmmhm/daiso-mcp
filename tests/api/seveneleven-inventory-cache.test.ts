import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '../../src/api/response.js';
import { registerSevenElevenRoutes } from '../../src/api/routes/sevenelevenRoutes.js';

const handlers = vi.hoisted(() => ({ inventory: vi.fn() }));
vi.mock('../../src/api/sevenelevenHandlers.js', () => ({
  handleSevenElevenCheckInventory: handlers.inventory,
  handleSevenElevenGetCatalogSnapshot: vi.fn(),
  handleSevenElevenGetSearchPopwords: vi.fn(),
  handleSevenElevenSearchStores: vi.fn(),
  handleSevenElevenSearchProducts: vi.fn(),
}));
let app: Hono<{ Bindings: AppBindings }>;
const match = vi.fn();
const put = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  match.mockResolvedValue(undefined);
  vi.stubGlobal('caches', { default: { match, put } });
  app = new Hono<{ Bindings: AppBindings }>();
  registerSevenElevenRoutes(app);
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  { stockAvailable: false, stockError: null },
  { stockAvailable: false, stockError: { code: 501 } },
  { stockAvailable: true, stockError: { code: 501 } },
])('미확인 또는 오류 재고 응답은 캐시하지 않는다 (%j)', async (data) => {
  handlers.inventory.mockImplementation(() => Response.json({ data }));
  const response = await app.request('/api/seveneleven/inventory?keyword=과자');
  expect(put).not.toHaveBeenCalled();
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('확인한 0개 재고를 30초 캐시하고 이전 실패 캐시 키를 사용하지 않는다', async () => {
  handlers.inventory.mockImplementation(() => Response.json({ data: {
    stockAvailable: true, stockError: null, inventory: { stores: [{ stockQuantity: 0 }] },
  } }));
  const response = await app.request('/api/seveneleven/inventory?keyword=과자');
  expect(put).toHaveBeenCalledTimes(1);
  expect(response.headers.get('cache-control')).toBe('public, max-age=30, s-maxage=30, stale-while-revalidate=0');
  const key = match.mock.calls[0][0] as Request;
  expect(new URL(key.url).searchParams.get('__cache_prefix')).toBe('seveneleven-inventory-v3');
});

it.each([
  () => new Response('invalid'),
  () => Response.json(null),
  () => Response.json({}),
  () => Response.json({}, { status: 503 }),
])('정상 재고 구조가 없는 응답은 캐시하지 않는다', async (makeResponse) => {
  handlers.inventory.mockImplementation(makeResponse);
  await app.request('/api/seveneleven/inventory?keyword=과자');
  expect(put).not.toHaveBeenCalled();
});
