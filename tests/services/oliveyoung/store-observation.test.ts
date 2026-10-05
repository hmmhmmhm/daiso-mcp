import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveOliveyoungStoreStock } from '../../../src/services/oliveyoung/normalize.js';
import {
  __testOnlyClearOliveyoungCaches,
  enrichOliveyoungProductsWithNearbyStoreInventory,
} from '../../../src/services/oliveyoung/client.js';
import { generateFullOpenApiSpec } from '../../../src/pages/openapi.js';

it.each([undefined, null, -1, 1.5, NaN, Infinity, '3', '', false])(
  '미관측 또는 유효하지 않은 수량 %s를 0으로 바꾸지 않는다',
  (quantity) => {
    const store = resolveOliveyoungStoreStock({
      storeCode: 'DF23',
      salesStoreYn: true,
      remainQuantity: quantity as number,
      o2oRemainQuantity: quantity as number,
    });
    expect(store).toMatchObject({
      remainQuantity: null,
      o2oRemainQuantity: null,
      stockStatus: 'unknown',
      stockLabel: '재고 미확인',
    });
  },
);
it('두 수량이 빠진 판매 매장의 재고는 미확인이다', () => {
  expect(resolveOliveyoungStoreStock({ storeCode: 'DF23', salesStoreYn: true })).toMatchObject({
    remainQuantity: null,
    o2oRemainQuantity: null,
    stockStatus: 'unknown',
  });
});
it.each([
  [{ remainQuantity: 0 }, 'out_of_stock', '품절'],
  [{ o2oRemainQuantity: 0 }, 'out_of_stock', '품절'],
  [{ remainQuantity: 0, o2oRemainQuantity: 0 }, 'out_of_stock', '품절'],
  [{ remainQuantity: 3 }, 'in_stock', '재고 3개'],
  [{ o2oRemainQuantity: 9 }, 'in_stock', '재고 9개 이상'],
  [{ remainQuantity: 2, o2oRemainQuantity: 5 }, 'in_stock', '재고 5개'],
  [{ remainQuantity: -1, o2oRemainQuantity: 5 }, 'in_stock', '재고 5개'],
])('관측한 유효 수량의 상태를 유지한다: %j', (quantities, stockStatus, stockLabel) => {
  expect(resolveOliveyoungStoreStock({ salesStoreYn: true, ...quantities })).toMatchObject({
    stockStatus,
    stockLabel,
  });
});
it('명시적 미판매 상태는 수량이 없어도 유지한다', () => {
  expect(resolveOliveyoungStoreStock({ salesStoreYn: false })).toMatchObject({
    remainQuantity: null,
    o2oRemainQuantity: null,
    stockStatus: 'not_sold',
  });
});
it('판매 여부와 수량 모두 빠진 매장을 미판매로 추정하지 않는다', () => {
  expect(resolveOliveyoungStoreStock({ storeCode: 'DF23' })).toMatchObject({
    remainQuantity: null,
    o2oRemainQuantity: null,
    stockStatus: 'unknown',
  });
});
it('판매 여부가 빠져도 양수 수량은 관측 재고로 유지한다', () => {
  expect(resolveOliveyoungStoreStock({ remainQuantity: 2 })).toMatchObject({
    stockStatus: 'in_stock',
  });
});
it.each(['false', 'true', 0, 1, null])(
  '유효하지 않은 판매 여부 %s만으로 미판매를 추정하지 않는다',
  (salesStoreYn) => {
    expect(resolveOliveyoungStoreStock({ salesStoreYn: salesStoreYn as boolean })).toMatchObject({
      stockStatus: 'unknown',
    });
  },
);
const fetchMock = vi.fn();
beforeEach(() => {
  __testOnlyClearOliveyoungCaches();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
it.each([
  [[{ salesStoreYn: true }], 'unknown', 0, 0, 0],
  [
    [{ salesStoreYn: true }, { salesStoreYn: true, remainQuantity: 0 }, { salesStoreYn: false }],
    'unknown',
    0,
    1,
    1,
  ],
  [[{ salesStoreYn: true }, { salesStoreYn: true, remainQuantity: 1 }], 'in_stock', 1, 0, 0],
])(
  '주변 매장 미확인 상태를 상품과 품절 집계에 반영한다: %j',
  async (storeList, stockStatus, inStockCount, outOfStockCount, notSoldCount) => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ status: 'SUCCESS', data: { goodsInfo: { masterGoodsNumber: '8801' } } }),
      )
      .mockResolvedValueOnce(Response.json({ status: 'SUCCESS', data: { storeList } }));
    const product = {
      goodsNumber: 'A1',
      goodsName: '팩',
      priceToPay: 1,
      originalPrice: 1,
      discountRate: 0,
      o2oStockFlag: false,
      o2oRemainQuantity: 0,
      inStock: false,
      stockStatus: 'out_of_stock' as const,
    };
    const result = await enrichOliveyoungProductsWithNearbyStoreInventory([product], {
      latitude: 37,
      longitude: 127,
      storeKeyword: '',
      maxProducts: 1,
    });
    expect(result.products[0]).toMatchObject({
      stockStatus,
      storeInventory: { inStockCount, outOfStockCount, notSoldCount },
    });
  },
);
it('공개 스키마에 미확인 매장 상태와 nullable 수량을 제공한다', () => {
  const spec = generateFullOpenApiSpec('https://example.com') as {
    components: {
      schemas: {
        OliveyoungStockStore: {
          properties: Record<string, { nullable?: boolean; enum?: string[] }>;
        };
      };
    };
  };
  const properties = spec.components.schemas.OliveyoungStockStore.properties;
  expect(properties.remainQuantity.nullable).toBe(true);
  expect(properties.o2oRemainQuantity.nullable).toBe(true);
  expect(properties.stockStatus.enum).toContain('unknown');
});
