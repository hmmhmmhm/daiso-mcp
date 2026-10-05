import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  __testOnlyClearOliveyoungCaches,
  fetchOliveyoungProducts,
  enrichOliveyoungProductsWithNearbyStoreInventory,
} from '../../../src/services/oliveyoung/client.js';
import { createCheckInventoryTool } from '../../../src/services/oliveyoung/tools/checkInventory.js';
const fetchMock = vi.fn();
const product = {
  goodsNumber: 'A1',
  goodsName: '팩',
  priceToPay: 1,
  originalPrice: 1,
  discountRate: 0,
  o2oStockFlag: true,
  o2oRemainQuantity: 1,
  inStock: true,
  stockStatus: 'in_stock' as const,
  stockSource: 'global_search' as const,
};
const params = { latitude: 37, longitude: 127, storeKeyword: '', maxProducts: 1 };
const search = { keyword: '팩', page: 1, size: 1, sort: '01', includeSoldOut: false };
const response = (data: unknown) => Response.json({ status: 'SUCCESS', data });
beforeEach(() => {
  __testOnlyClearOliveyoungCaches();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('빈 재고 payload를 확인 완료나 품절로 집계하지 않는다', async () => {
  fetchMock
    .mockResolvedValueOnce(response({ goodsInfo: { masterGoodsNumber: '8801' } }))
    .mockResolvedValueOnce(response({}));
  const result = await enrichOliveyoungProductsWithNearbyStoreInventory([product], params);
  expect(result.checkedCount).toBe(0);
  expect(result.products[0]).toEqual(product);
});
it('모든 주변 매장이 미판매이면 상품도 미판매로 표시한다', async () => {
  fetchMock
    .mockResolvedValueOnce(response({ goodsInfo: { masterGoodsNumber: '8801' } }))
    .mockResolvedValueOnce(
      response({ totalCount: 1, storeList: [{ storeCode: 'S1', salesStoreYn: false }] }),
    );
  const result = await enrichOliveyoungProductsWithNearbyStoreInventory([product], params);
  expect(result.products[0].stockStatus).toBe('not_sold');
});
it('로컬 재고 조회 실패에 29분 전 수량을 재사용하지 않는다', async () => {
  vi.useFakeTimers();
  fetchMock
    .mockResolvedValueOnce(response({ goodsInfo: { masterGoodsNumber: '8801' } }))
    .mockResolvedValueOnce(
      response({
        totalCount: 1,
        storeList: [{ storeCode: 'S1', salesStoreYn: true, remainQuantity: 5 }],
      }),
    );
  await enrichOliveyoungProductsWithNearbyStoreInventory([product], params);
  vi.setSystemTime(Date.now() + 29 * 60 * 1000);
  fetchMock
    .mockResolvedValueOnce(response({ goodsInfo: { masterGoodsNumber: '8801' } }))
    .mockRejectedValue(new Error('offline'));
  const result = await enrichOliveyoungProductsWithNearbyStoreInventory([product], params);
  expect(result.checkedCount).toBe(0);
  expect(result.products[0].storeInventory).toBeUndefined();
});
it('검색 캐시는 상품 정보만 복구하고 과거 재고는 미확인으로 표시한다', async () => {
  fetchMock.mockResolvedValueOnce(response({ searchList: [product], totalCount: 1 }));
  await fetchOliveyoungProducts(search);
  fetchMock.mockRejectedValue(new Error('offline'));
  const result = await fetchOliveyoungProducts(search);
  expect(result.products[0].stockStatus).toBe('unknown');
  expect(result.products[0].inStock).toBe(false);
});
it('전국 검색 재고는 로컬 MCP 재고 수량에 포함하지 않는다', async () => {
  fetchMock
    .mockResolvedValueOnce(response({ storeList: [], totalCount: 0 }))
    .mockResolvedValueOnce(response({ searchList: [product], totalCount: 1 }))
    .mockRejectedValue(new Error('offline'));
  const result = await createCheckInventoryTool().handler({ keyword: '팩' });
  const inventory = JSON.parse(result.content[0].text).inventory;
  expect(inventory.stockCheckedCount).toBe(0);
  expect(inventory.stockUncheckedCount).toBe(1);
  expect(inventory.inStockCount).toBe(0);
  expect(inventory.outOfStockCount).toBe(0);
});
it('릴레이 설정에서 기본 조회 시간을 유지하고 명시 설정도 우선한다', async () => {
  fetchMock.mockImplementation(async () =>
    response({ storeList: [], searchList: [], totalCount: 0 }),
  );
  const relay = { relayUrl: 'https://relay.invalid', relayToken: 'unit-test' };
  const tool = createCheckInventoryTool(undefined, relay);
  await tool.handler({ keyword: '팩', stockCheckLimit: 0 });
  expect(tool.metadata.inputSchema.timeoutMs.parse(undefined)).toBe(60000);
  expect(
    createCheckInventoryTool(undefined, {
      ...relay,
      timeout: 1234,
    }).metadata.inputSchema.timeoutMs.parse(undefined),
  ).toBe(1234);
});
