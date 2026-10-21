import { describe, expect, it } from 'vitest';
import { MCP_SMOKE_SCENARIOS } from '../../scripts/ops/mcp-smoke.js';
const inventory = () => ({
  summary: { headline: '재고 조회 결과' },
  selectedProduct: { id: 'p1', name: '수납박스' },
  storeInventory: {
    inStockCount: 1,
    outOfStockCount: 0,
    unknownStockCount: 0,
    stores: [{ storeCode: 's1', storeName: '강남역점', quantity: 5 }],
  },
});
const scenario = (toolName: string) => MCP_SMOKE_SCENARIOS.find((s) => s.toolName === toolName)!;

describe('실데이터 의미를 확인하는 MCP smoke', () => {
  it('요약만 있는 응답을 정상 재고 조회로 통과시키지 않는다', () => {
    expect(
      scenario('daiso_find_inventory_by_name').validate({ summary: { headline: '검색 결과' } }),
    ).not.toBeNull();
  });
  it('정상 수량과 품절을 통과시키고 미확인 수량만 있는 응답은 실패한다', () => {
    const check = scenario('daiso_find_inventory_by_name').validate;
    expect(check(inventory())).toBeNull();
    const zero = inventory();
    zero.storeInventory.stores[0].quantity = 0;
    zero.storeInventory.inStockCount = 0;
    zero.storeInventory.outOfStockCount = 1;
    expect(check(zero)).toBeNull();
    expect(check({ ...zero, selectedProduct: null })).not.toBeNull();
    expect(check({ ...zero, storeInventory: { stores: [] } })).not.toBeNull();
    const unknown = {
      ...zero,
      storeInventory: {
        inStockCount: 0,
        outOfStockCount: 0,
        unknownStockCount: 1,
        stores: [{ storeCode: 's1', storeName: '강남역점', quantity: null }],
      },
    };
    expect(check(unknown)).not.toBeNull();
    expect(
      check({ ...zero, storeInventory: { ...zero.storeInventory, inStockCount: 8 } }),
    ).not.toBeNull();
  });
  it('카탈로그 두 작업을 모두 호출 대상에 포함하고 빈 기본 응답을 거절한다', () => {
    const popwords = scenario('seveneleven_get_search_popwords');
    const catalog = scenario('seveneleven_get_catalog_snapshot');
    expect(popwords).toBeDefined();
    expect(catalog).toBeDefined();
    expect(popwords.validate({ available: false, count: 0, keywords: [] })).toBeNull();
    expect(popwords.validate({ available: true, count: 1, keywords: ['커피'] })).toBeNull();
    expect(popwords.validate({})).not.toBeNull();
    expect(popwords.validate({ available: true, count: 1, keywords: [] })).not.toBeNull();
    expect(catalog.validate({})).not.toBeNull();
    const section = { totalCount: 1, items: [{ itemCode: '1', itemName: '상품' }] };
    expect(
      catalog.validate({
        pages: section,
        issues: section,
        exhibitions: { totalCount: 0, items: [] },
      }),
    ).toBeNull();
    expect(
      catalog.validate({
        pages: { totalCount: 0, items: [] },
        issues: section,
        exhibitions: section,
      }),
    ).not.toBeNull();
  });
});
