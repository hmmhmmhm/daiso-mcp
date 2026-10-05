import { describe, expect, it, vi } from 'vitest';
import { parseStores } from '../../src/utils/cliInteractiveHelpers.js';
import { matchSelectedStore, quantityText } from '../../src/cli/interactiveStoreInventory.js';
import { runCuItemSearch, runOliveyoungItemSearch } from '../../src/cli/interactiveItemSearch.js';

const store = { storeCode: 'DF23', name: '선택점', address: '주소', phone: '' };
function response(data: unknown) { return new Response(JSON.stringify({ success: true, data })); }
function setup(data: unknown, selection = '1', nextData?: unknown) {
  const out: string[] = [];
  const answers = ['검색', selection];
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response(data));
  if (nextData !== undefined) fetchImpl.mockResolvedValueOnce(response(nextData));
  return { out, fetchImpl, deps: { fetchImpl, writeOut: (line: string) => out.push(line), writeErr: () => {} },
    prompt: { ask: async () => answers.shift() ?? '', close: () => {} } };
}
const product = { goodsNumber: 'G1', goodsName: '상품', priceToPay: 1000, o2oRemainQuantity: 0 };
const items = [{ itemCode: 'A', itemName: '첫상품', price: 1000, pickupYn: true },
  { itemCode: 'B', itemName: '다른상품', price: 2000, pickupYn: true }];
function cuData(code: unknown = 'A', extra: Record<string, unknown> = {}) {
  return { inventory: { items }, nearbyStores: { available: true, stockItemCode: code,
    stores: [{ storeCode: 'DF23', storeName: '선택점', address: '주소', stock: 48,
      pickupYn: false, deliveryYn: true, reserveYn: false }], ...extra } };
}

describe('선택 매장 재고의 상품/매장 일치', () => {
  it('매장 코드를 선택 과정에서 보존한다', () => {
    expect(parseStores({ success: true, data: { stores: [store] } })[0]).toMatchObject({ storeCode: 'DF23' });
  });
  it('올리브영은 동일 이름의 다른 매장이 아닌 선택 코드의 실제 재고를 표시한다', async () => {
    const s = setup({ inventory: { products: [{ ...product, storeInventory: { stores: [
      { storeCode: 'OTHER', storeName: store.name, remainQuantity: 99 },
      { storeCode: 'DF23', storeName: '다른표기', remainQuantity: 10, o2oRemainQuantity: 8, stockStatus: 'in_stock' },
    ] } }] } });
    await runOliveyoungItemSearch(s.deps, s.prompt, store);
    expect(s.out).toContain('- 남은수량: 10');
    expect(s.out).toContain('- O2O 남은수량: 8');
    expect(s.out).toContain('- 재고 상태: 재고 있음');
  });
  it.each([
    [{ storeCode: 'DF23', remainQuantity: 0, o2oRemainQuantity: 0, stockStatus: 'out_of_stock' }, '0', '품절'],
    [{ storeCode: 'DF23', stockStatus: 'not_sold' }, '확인 불가', '미취급'],
    [{ storeCode: 'DF23', remainQuantity: null }, '확인 불가', '확인 불가'],
    [{ storeCode: 'OTHER', storeName: store.name, remainQuantity: 99 }, '확인 불가', '확인 불가'],
  ])('올리브영 수량과 미취급/불명 상태를 구분한다 %#', async (entry, quantity, status) => {
    const s = setup({ inventory: { products: [{ ...product, storeInventory: { stores: [entry] } }] } });
    await runOliveyoungItemSearch(s.deps, s.prompt, store);
    expect(s.out).toContain(`- 남은수량: ${quantity}`);
    expect(s.out).toContain(`- 재고 상태: ${status}`);
  });
  it('올리브영 미조회 후보는 재조회 후 동일 상품의 매장 재고를 표시한다', async () => {
    const chosen = { ...product, goodsNumber: 'G6', goodsName: '여섯번째' };
    const s = setup({ inventory: { products: [product, chosen] } }, '2', {
      inventory: { products: [{ ...chosen, storeInventory: { stores: [
        { storeCode: 'DF23', remainQuantity: 10, o2oRemainQuantity: 8, stockStatus: 'in_stock' },
      ] } }] },
    });
    await runOliveyoungItemSearch(s.deps, s.prompt, store);
    expect(new URL(String(s.fetchImpl.mock.calls[1]?.[0])).searchParams.get('keyword')).toBe('여섯번째');
    expect(s.out).toContain('- 남은수량: 10');
  });
  it('올리브영 재조회 상품 코드가 다르면 재고를 사용하지 않는다', async () => {
    const s = setup({ inventory: { products: [product] } }, '1', {
      inventory: { products: [{ ...product, goodsNumber: 'OTHER', storeInventory: { stores: [
        { storeCode: 'DF23', remainQuantity: 99, stockStatus: 'in_stock' },
      ] } }] },
    });
    await runOliveyoungItemSearch(s.deps, s.prompt, store);
    expect(s.out).toContain('- 남은수량: 확인 불가');
  });
  it('CU는 선택 매장의 수량과 채널을 표시한다', async () => {
    const s = setup(cuData());
    await runCuItemSearch(s.deps, s.prompt, store);
    expect(s.out).toContain('- 재고 수량: 48');
    expect(s.out).toContain('- 픽업 가능: 아니오');
    expect(s.out).toContain('- 배달 가능: 예');
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('CU의 다른 상품 선택은 상품명으로 다시 조회하고 코드가 일치한 재고를 쓴다', async () => {
    const s = setup(cuData(), '2', cuData('B'));
    await runCuItemSearch(s.deps, s.prompt, store);
    expect(new URL(String(s.fetchImpl.mock.calls[1]?.[0])).searchParams.get('keyword')).toBe('다른상품');
    expect(s.out).toContain('- 재고 수량: 48');
  });
  it.each([cuData('A'), cuData('B', { available: false }), cuData(null)])(
    'CU 재조회 상품 불일치/조회불가/코드 누락은 수량과 채널을 불명으로 표시한다 %#', async (next) => {
      const s = setup(cuData(), '2', next);
      await runCuItemSearch(s.deps, s.prompt, store);
      expect(s.out).toContain('- 재고 수량: 확인 불가');
      expect(s.out).toContain('- 픽업 가능: 확인 불가');
    });
});

// 불완전한 응답에서 다른 매장의 재고나 수량 0을 만들어내지 않는다.
describe('선택 매장 재고의 불완전한 응답', () => {
  it.each([0, null, undefined, -1, 'invalid'])('CU 수량 %s의 의미를 보존한다', async (stock) => {
    const data = cuData();
    data.nearbyStores.stores[0].stock = stock as number;
    const s = setup(data);
    await runCuItemSearch(s.deps, s.prompt, store);
    expect(s.out).toContain(`- 재고 수량: ${stock === 0 ? '0' : '확인 불가'}`);
  });
  it('CU 같은 이름의 다른 코드 매장 채널을 가져오지 않는다', async () => {
    const data = cuData();
    data.nearbyStores.stores[0].storeCode = 'OTHER';
    const s = setup(data);
    await runCuItemSearch(s.deps, s.prompt, store);
    expect(s.out).toContain('- 재고 수량: 확인 불가');
    expect(s.out).toContain('- 배달 가능: 확인 불가');
  });
  it('CU 상품 재조회 HTTP 실패를 불명으로 표시한다', async () => {
    const s = setup(cuData(), '2');
    s.fetchImpl.mockRejectedValueOnce(new Error('offline'));
    await runCuItemSearch(s.deps, s.prompt, store);
    expect(s.out).toContain('- 재고 수량: 확인 불가');
  });
  it.each([
    { success: false },
    { success: true, data: {} },
    { success: true, data: { inventory: { products: [] } } },
  ])('올리브영 재조회 불완전 응답은 불명이다 %#', async (next) => {
    const s = setup({ inventory: { products: [product] } });
    s.fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify(next)));
    await runOliveyoungItemSearch(s.deps, s.prompt, store);
    expect(s.out).toContain('- 남은수량: 확인 불가');
  });
});


describe('매장 식별과 수량 검증', () => {
  it('코드가 없으면 고유한 이름/주소 쌍으로만 매장을 찾는다', () => {
    const entry = { storeName: store.name, address: store.address, stock: 48 };
    expect(matchSelectedStore([entry], store)).toBe(entry);
    expect(matchSelectedStore([entry, entry], store)).toBeUndefined();
    expect(matchSelectedStore([{ ...entry, address: '다른 주소' }], store)).toBeUndefined();
    expect(matchSelectedStore([entry], { ...store, address: '' })).toBeUndefined();
    expect(matchSelectedStore([entry], { ...store, storeCode: undefined })).toBe(entry);
  });
  it('중복 코드나 잘못된 목록을 임의로 선택하지 않는다', () => {
    expect(matchSelectedStore([{ storeCode: 'DF23' }, { storeCode: 'DF23' }], store)).toBeUndefined();
    expect(matchSelectedStore(undefined, store)).toBeUndefined();
    expect(matchSelectedStore([null, 'bad'], store)).toBeUndefined();
  });
  it.each([[0, '0'], ['8', '8'], ['', '확인 불가'], [true, '확인 불가'], [Infinity, '확인 불가']])(
    '수량 %s를 정확히 표시한다', (input, expected) => expect(quantityText(input)).toBe(expected),
  );
});

// 2026-10-05 실제 REST 응답의 선택 상품/매장 필드만 남긴 fixture.
// REST nearbyStores에는 도구 응답과 달리 available 필드가 없다.
const cuRestData = {
  keyword: '레쓰비',
  nearbyStores: {
    totalCount: 1, stockItemCode: '8801056018979', stockItemName: '레쓰비)캔200ml',
    stores: [{ storeCode: '24008', storeName: '강남푸르지오점', address: '선택 주소', stock: 48,
      pickupYn: false, deliveryYn: false, reserveYn: false }],
  },
  inventory: { available: true, items: [{ itemCode: '8801056018979', itemName: '레쓰비)캔200ml',
    price: 1300, pickupYn: true, deliveryYn: true, reserveYn: false }] },
};
const cuRestStore = { storeCode: '24008', name: '강남푸르지오점', address: '선택 주소', phone: '' };

describe('CU REST와 웹 fallback 계약', () => {
  it('실제 REST의 available 없는 nearbyStores에서 매장 재고 48/픽업 불가를 표시한다', async () => {
    const s = setup(cuRestData);
    await runCuItemSearch(s.deps, s.prompt, cuRestStore);
    expect(s.out).toContain('- 재고 수량: 48');
    expect(s.out).toContain('- 픽업 가능: 아니오');
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([null, undefined, -1, 0.5, 'invalid'])('웹 fallback/불명 수량 %s의 더미 채널을 불가로 단정하지 않는다', async (stock) => {
    const data = structuredClone(cuRestData);
    Object.assign(data.nearbyStores.stores[0], { stock, latitude: 0, longitude: 0,
      pickupYn: false, deliveryYn: false, reserveYn: false });
    const s = setup(data);
    await runCuItemSearch(s.deps, s.prompt, cuRestStore);
    expect(s.out).toContain('- 재고 수량: 확인 불가');
    expect(s.out).toContain('- 픽업 가능: 확인 불가');
    expect(s.out).toContain('- 배달 가능: 확인 불가');
    expect(s.out).toContain('- 예약 가능: 확인 불가');
  });
  it('available true 응답도 재고 없는 웹 fallback의 더미 채널을 검증된 불가로 표시하지 않는다', async () => {
    const data = cuData();
    Object.assign(data.nearbyStores.stores[0], { stock: null, latitude: 0, longitude: 0,
      pickupYn: false, deliveryYn: false, reserveYn: false });
    const s = setup(data);
    await runCuItemSearch(s.deps, s.prompt, store);
    expect(s.out).toContain('- 픽업 가능: 확인 불가');
    expect(s.out).toContain('- 배달 가능: 확인 불가');
  });
  it('실제 REST의 확정 재고 0과 실제 false 채널은 보존한다', async () => {
    const data = structuredClone(cuRestData);
    data.nearbyStores.stores[0].stock = 0;
    const s = setup(data);
    await runCuItemSearch(s.deps, s.prompt, cuRestStore);
    expect(s.out).toContain('- 재고 수량: 0');
    expect(s.out).toContain('- 픽업 가능: 아니오');
  });
  it('소수 수량을 재고 수량으로 표시하지 않는다', () => {
    expect(quantityText(0.5)).toBe('확인 불가');
    expect(quantityText('1.5')).toBe('확인 불가');
  });
});
