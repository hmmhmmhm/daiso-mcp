import { afterEach, expect, it, vi } from 'vitest';
import { selectGs25InventoryProduct } from '../../../src/services/gs25/productSelection.js';
import { createCheckInventoryTool } from '../../../src/services/gs25/tools/checkInventory.js';
import { handleGs25CheckInventory } from '../../../src/api/gs25Handlers.js';
import { clearGs25StoresCache } from '../../../src/services/gs25/client.js';

const product = (itemCode: string, itemName: string, shortItemName = '') => ({
  itemCode, itemName, shortItemName, imageUrl: '', rating: 0, stockCheckEnabled: true,
});
const products = [product('zero', '코카콜라제로캔350ML'), product('8801094017200', '코카콜라캔350ML')];
afterEach(() => { vi.unstubAllGlobals(); clearGs25StoresCache(); });

it('일반 콜라 정확 일치를 먼저 선택한다', () => {
  expect(selectGs25InventoryProduct(products, '코카콜라 캔350ml')).toBe(products[1]);
});
it('전체 이름 일치를 축약 이름 일치보다 우선한다', () => {
  const rows = [product('zero', '제로', '콜라'), product('regular', '콜라')];
  expect(selectGs25InventoryProduct(rows, '콜라')).toBe(rows[1]);
});
it('축약 이름도 정확히 일치하면 선택한다', () => {
  const rows = [products[0], product('regular', '다른 전체 이름', '콜라')];
  expect(selectGs25InventoryProduct(rows, '콜라')).toBe(rows[1]);
});
it('정확 일치가 없는 일반 키워드는 기존 검색 순서를 유지한다', () => {
  expect(selectGs25InventoryProduct(products, '콜라')).toBe(products[0]);
});
it('코드가 없는 정확 일치 항목은 건너뛴다', () => {
  expect(selectGs25InventoryProduct([product('', '콜라'), ...products], '콜라')).toBe(products[0]);
});
it('유효한 코드가 없으면 undefined를 반환한다', () => {
  expect(selectGs25InventoryProduct([product('', '콜라')], '콜라')).toBeUndefined();
  expect(selectGs25InventoryProduct([], '콜라')).toBeUndefined();
});

it.each(['REST', 'MCP'])('%s는 선택된 일반 콜라 코드로 실제 재고를 요청한다', async (route) => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
    SearchQueryResult: { Collection: [{ Documentset: { Document: products.map(p => ({ field: p })) } }] },
  }))).mockResolvedValueOnce(new Response(JSON.stringify({ stores: [{ storeCode: 'VO882', storeName: '강남본점', realStockQuantity: '7' }] })));
  vi.stubGlobal('fetch', fetchMock);
  let payload: { itemCode: string; product: { name: string }; inventory: { stores: { realStockQuantity: number }[] } };
  if (route === 'MCP') {
    const result = await createCheckInventoryTool().handler({ keyword: '코카콜라캔350ML', latitude: 37.4981, longitude: 127.0276 });
    payload = JSON.parse(result.content[0].text);
  } else {
    const json = vi.fn();
    const queries: Record<string, string> = { keyword: '코카콜라캔350ML', lat: '37.4981', lng: '127.0276' };
    await handleGs25CheckInventory({ env: {}, req: { query: (key: string) => queries[key] }, json } as unknown as Parameters<typeof handleGs25CheckInventory>[0]);
    payload = json.mock.calls[0][0].data;
  }
  expect(payload.itemCode).toBe('8801094017200');
  expect(payload.product.name).toBe('코카콜라캔350ML');
  expect(String(fetchMock.mock.calls[1][0])).toContain('itemCode=8801094017200');
  expect(payload.inventory.stores[0].realStockQuantity).toBe(7);
});
