import { describe, expect, it } from 'vitest';
import { MCP_SMOKE_SCENARIOS } from '../../scripts/ops/mcp-smoke.js';

const scenario = (name: string) => MCP_SMOKE_SCENARIOS.find((item) => item.toolName === name)!;

// 운영 응답의 구조만 보존하고 점포 식별 정보는 테스트용 값으로 바꿉니다.
const sevenInventory = {
  keyword: '핫식스',
  storeKeyword: '강남',
  product: {
    itemCode: '8801056240998',
    itemName: '칠성)핫식스더킹퍼플355ml',
    salePrice: 2500,
    imageUrl: '',
  },
  stockAvailable: true,
  stockError: null,
  note: '실시간 재고 데이터가 포함되어 있습니다.',
  inventory: {
    totalStoreCount: 100,
    inStockStoreCount: 1,
    count: 1,
    stores: [
      { storeCode: 's1', storeName: '테스트점', stockQuantity: 9, isSoldOut: false, distanceM: 0 },
    ],
  },
};

const emartInventory = {
  keyword: '커피',
  pluCd: '8801115139836',
  productCandidates: [],
  selectionReason: 'explicit_code',
  location: null,
  storeFilters: {
    storeKeyword: '강남',
    appliedStoreKeyword: '강남',
    storeLimit: 1,
    directBizNos: [],
  },
  nearbyStores: { totalCount: 71, stores: [{ storeCode: 's1', storeName: '테스트점' }] },
  inventory: {
    goodsInfo: { viewPrice: 2800, goodsNm: '서울)강릉커피라떼250ml', pluCd: '8801115139836' },
    count: 0,
    stores: [],
  },
};

describe('운영 재고 응답 기반 smoke 회귀', () => {
  it('세븐일레븐 재고 대표 검색어는 실제 재고를 확인한 핫식스다', () => {
    const entry = scenario('seveneleven_check_inventory');
    expect(entry.args).toMatchObject({ keyword: '핫식스', storeLimit: 1, storeKeyword: '강남' });
    expect(entry.validate(sevenInventory)).toBeNull();
  });

  it('세븐일레븐 상품은 찾았지만 재고가 미확인이면 실패한다', () => {
    const payload = structuredClone(sevenInventory);
    payload.stockAvailable = false;
    payload.inventory.inStockStoreCount = 0;
    payload.inventory.stores[0].stockQuantity = -1;
    expect(scenario('seveneleven_check_inventory').validate(payload)).toBeTypeOf('string');
  });

  it('이마트24는 수량이 없는 후보를 품절로 추정하지 않고 최대 10개 점포를 묶어 조회한다', () => {
    const entry = scenario('emart24_check_inventory');
    expect(entry.args).toMatchObject({ storeLimit: 10, storeKeyword: '강남', timeoutMs: 20000 });
    expect(entry.productCode).toBe('pluCd');
    for (const service of ['gs25', 'seveneleven', 'cu', 'oliveyoung']) {
      expect(scenario(`${service}_check_inventory`).args.storeLimit).toBe(1);
    }
  });

  it('이마트24 묶음 응답에서 반환된 0, 0, 4, 7의 실제 수량을 인정한다', () => {
    const payload = {
      ...emartInventory,
      inventory: {
        ...emartInventory.inventory,
        count: 4,
        stores: [0, 0, 4, 7].map((bizQty, index) => ({
          bizNo: `s${index}`,
          storeName: `테스트${index}점`,
          bizQty,
          address: '',
          phone: '',
          distanceM: null,
        })),
      },
    };
    expect(scenario('emart24_check_inventory').validate(payload)).toBeNull();
    const unknown = {
      ...payload,
      inventory: {
        ...payload.inventory,
        stores: payload.inventory.stores.map((store) => ({ ...store, bizQty: null })),
      },
    };
    expect(scenario('emart24_check_inventory').validate(unknown)).toBeTypeOf('string');
  });

  it('이마트24 상품 정보와 매장 목록이 있어도 수량 응답이 없으면 실패한다', () => {
    expect(scenario('emart24_check_inventory').validate(emartInventory)).toBeTypeOf('string');
  });
});
