import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  __testOnlyClearOliveyoungCaches,
  enrichOliveyoungProductsWithNearbyStoreInventory,
} from '../../../src/services/oliveyoung/client.js';
import type { OliveyoungProduct } from '../../../src/services/oliveyoung/types.js';

const products: OliveyoungProduct[] = Array.from({ length: 7 }, (_, index) => ({
  goodsNumber: `CAPACITY-${index}`,
  goodsName: `상품 ${index}`,
  priceToPay: 1000,
  originalPrice: 1000,
  discountRate: 0,
  o2oStockFlag: false,
  o2oRemainQuantity: 0,
  inStock: false,
  stockStatus: 'out_of_stock',
  stockSource: 'global_search',
}));
const params = { latitude: 37.5, longitude: 127, storeKeyword: '' };

beforeEach(() => __testOnlyClearOliveyoungCaches());
afterEach(() => vi.unstubAllGlobals());

it('재고 요청을 최대 2개씩 실행하고 보강 상품을 최대 5개로 제한한다', async () => {
  const pending: Array<() => void> = [];
  let active = 0;
  let peak = 0;
  const goodsNumbers: string[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    active += 1;
    peak = Math.max(peak, active);
    const payload = JSON.parse(init.body as string);
    const goodsInfo = url.endsWith('/stock-goods-info-v3');
    if (goodsInfo) goodsNumbers.push(payload.goodsNo);
    return new Promise<Response>((resolve) => {
      pending.push(() => {
        active -= 1;
        resolve(Response.json({
          status: 'SUCCESS',
          data: goodsInfo
            ? { goodsInfo: { masterGoodsNumber: payload.goodsNo } }
            : { totalCount: 0, storeList: [] },
        }));
      });
    });
  }));

  let finished = false;
  const resultPromise = enrichOliveyoungProductsWithNearbyStoreInventory(products, {
    ...params, maxProducts: 1000,
  }).then((result) => {
    finished = true;
    return result;
  });
  while (!finished) {
    await vi.waitFor(() => expect(pending.length > 0 || finished).toBe(true));
    pending.shift()?.();
  }
  const result = await resultPromise;
  expect(peak).toBe(2);
  expect(goodsNumbers).toEqual(products.slice(0, 5).map((product) => product.goodsNumber));
  expect(result.checkedCount).toBe(5);
  expect(result.products).toHaveLength(7);
  expect(result.products.slice(5)).toEqual(products.slice(5));
});

it.each([
  [0, 0], [-1, 0], [1.9, 1], [3, 3], [NaN, 5], [Infinity, 5],
])('보강 제한 %s를 안전한 상품 수 %s로 적용한다', async (maxProducts, expected) => {
  const fetchMock = vi.fn((url: string) => Promise.resolve(Response.json({
    status: 'SUCCESS',
    data: url.endsWith('/stock-goods-info-v3')
      ? { goodsInfo: { masterGoodsNumber: 'MASTER' } }
      : { totalCount: 0, storeList: [] },
  })));
  vi.stubGlobal('fetch', fetchMock);
  const result = await enrichOliveyoungProductsWithNearbyStoreInventory(products, { ...params, maxProducts });
  expect(result.checkedCount).toBe(expected);
  expect(result.products).toHaveLength(products.length);
  expect(fetchMock).toHaveBeenCalledTimes(expected * 2);
});

it.each(['api', 'mcp'])('%s는 큰 제한값을 허용하되 실패/미보강 상품을 미확인으로 센다', async (surface) => {
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const payload = JSON.parse(init.body as string);
    let data: unknown = { totalCount: 0, storeList: [] };
    if (url.endsWith('/product-search-v3')) data = { totalCount: 7, searchList: products };
    if (url.endsWith('/stock-goods-info-v3')) {
      data = { goodsInfo: { masterGoodsNumber: payload.goodsNo === 'CAPACITY-0' ? '' : payload.goodsNo } };
    }
    return Promise.resolve(Response.json({ status: 'SUCCESS', data }));
  }));
  let inventory: { stockCheckedCount: number; stockUncheckedCount: number; products: OliveyoungProduct[] };
  if (surface === 'mcp') {
    const { createCheckInventoryTool } = await import('../../../src/services/oliveyoung/tools/checkInventory.js');
    const result = await createCheckInventoryTool().handler({ keyword: '상품', stockCheckLimit: 1000 });
    inventory = JSON.parse(result.content[0].text).inventory;
  } else {
    const { handleOliveyoungCheckInventory } = await import('../../../src/api/handlers.js');
    const context = {
      req: { query: (key: string) => ({ keyword: '상품', stockCheckLimit: '1000' })[key] },
      json: (data: unknown) => data,
    } as unknown as Parameters<typeof handleOliveyoungCheckInventory>[0];
    const result = await handleOliveyoungCheckInventory(context) as unknown as {
      data: { inventory: { stockCheckedCount: number; stockUncheckedCount: number; products: OliveyoungProduct[] } };
    };
    inventory = result.data.inventory;
  }
  expect(inventory.stockCheckedCount).toBe(4);
  expect(inventory.stockUncheckedCount).toBe(3);
  expect(inventory.products.filter((product: OliveyoungProduct) => product.stockSource === 'global_search'))
    .toHaveLength(3);
});
