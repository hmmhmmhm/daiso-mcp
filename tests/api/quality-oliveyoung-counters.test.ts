import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { handleOliveyoungCheckInventory } from '../../src/api/handlers.js';
import { enrichOliveyoungProductsWithNearbyStoreInventory, fetchOliveyoungProducts, fetchOliveyoungStores } from '../../src/services/oliveyoung/client.js';

vi.mock('../../src/services/oliveyoung/client.js', () => ({
  fetchOliveyoungProducts: vi.fn(), fetchOliveyoungStores: vi.fn(), enrichOliveyoungProductsWithNearbyStoreInventory: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

describe('REST 지역 재고 집계', () => {
  it.each([
    ['global_search', 'in_stock', 0, 0, 0, 0],
    ['nearby_store', 'in_stock', 1, 1, 0, 0],
    ['nearby_store', 'out_of_stock', 1, 0, 1, 0],
    ['nearby_store', 'not_sold', 1, 0, 0, 1],
    ['global_search', 'unknown', 0, 0, 0, 0],
  ] as const)('%s %s를 지역 확인 집계에 정확히 반영한다', async (stockSource, stockStatus, checked, inStock, outOfStock, notSold) => {
    const product = { goodsNumber: 'fixture', goodsName: '핸드크림', priceToPay: 1, originalPrice: 1, discountRate: 0, o2oStockFlag: true, o2oRemainQuantity: 1, inStock: stockStatus === 'in_stock', stockSource, stockStatus };
    vi.mocked(fetchOliveyoungStores).mockResolvedValue({ totalCount: 0, stores: [] });
    vi.mocked(fetchOliveyoungProducts).mockResolvedValue({ totalCount: 1, products: [product], nextPage: false });
    vi.mocked(enrichOliveyoungProductsWithNearbyStoreInventory).mockResolvedValue({ products: [product], checkedCount: checked });
    const app = new Hono(); app.get('/inventory', handleOliveyoungCheckInventory);
    const response = await app.request('/inventory?keyword=핸드크림');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { inventory: { stockCheckedCount: checked, stockUncheckedCount: 1 - checked, inStockCount: inStock, outOfStockCount: outOfStock, notSoldCount: notSold } } });
  });
});
