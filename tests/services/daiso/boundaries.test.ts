import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { fetchProducts, createSearchProductsTool } from '../../../src/services/daiso/tools/searchProducts.js';
import { fetchStoreInventory, createCheckInventoryTool } from '../../../src/services/daiso/tools/checkInventory.js';
import { createFindInventoryByNameTool } from '../../../src/services/daiso/tools/findInventoryByName.js';
import { createFindStoresTool } from '../../../src/services/daiso/tools/findStores.js';
import { handleSearchProducts, handleFindStores, handleCheckInventory } from '../../../src/api/daisoHandlers.js';
import { createMockContext } from '../../api/testHelpers.js';

const { json, auth, html } = vi.hoisted(() => ({ json: vi.fn(), auth: vi.fn(), html: vi.fn() }));
vi.mock('../../../src/services/daiso/client.js', () => ({ fetchDaisoJson: json, fetchDaisoJsonWithAuth: auth, fetchDaisoHtml: html }));
beforeEach(() => {
  vi.resetAllMocks();
  json.mockResolvedValue({ data: [], resultSet: { result: [{ resultDocuments: [], totalSize: 0 }] } });
  html.mockResolvedValue('');
});
const invalidNumbers = [0, -1, 1.5, NaN, Infinity, -Infinity];
const badQueries = ['0', '-1', '1.5', 'bad', '2abc', 'Infinity', '', ' '];

describe('다이소 숫자 경계', () => {
  for (const field of ['page', 'pageSize'] as const) {
    it.each(invalidNumbers)(`상품 검색 ${field}=%s 거부`, async (value) => {
      await expect(fetchProducts('컵', field === 'page' ? value : 1, field === 'pageSize' ? value : 30)).rejects.toThrow();
      expect(json).not.toHaveBeenCalled();
    });
    it.each(badQueries)(`REST 검색 ${field}=%s 거부`, async (value) => {
      const c = createMockContext({ q: '컵', [field]: value });
      await handleSearchProducts(c);
      expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }), 400);
      expect(json).not.toHaveBeenCalled();
    });
    it.each(badQueries)(`REST 재고 ${field}=%s 거부`, async (value) => {
      const c = createMockContext({ productId: '1', [field]: value });
      await handleCheckInventory(c);
      expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }), 400);
      expect(json).not.toHaveBeenCalled();
    });
  }
  it.each(badQueries)('REST 매장 limit=%s 거부', async (limit) => {
    const c = createMockContext({ keyword: '강남', limit });
    await handleFindStores(c);
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }), 400);
    expect(html).not.toHaveBeenCalled();
  });
  const tools = [
    [createSearchProductsTool(), { query: '컵' }, ['page', 'pageSize']],
    [createCheckInventoryTool(), { productId: '1' }, ['page', 'pageSize']],
    [createFindInventoryByNameTool(), { query: '컵' }, ['page', 'pageSize', 'productLimit']],
    [createFindStoresTool(), { keyword: '강남' }, ['limit']],
  ] as const;
  for (const [tool, base, fields] of tools) {
    for (const field of fields) {
      it.each(invalidNumbers)(`${tool.name} ${field}=%s 직접 호출/스키마 거부`, async (value) => {
        await expect(tool.handler({ ...base, [field]: value })).rejects.toThrow();
        expect(z.object(tool.metadata.inputSchema).safeParse({ ...base, [field]: value }).success).toBe(false);
        expect(json).not.toHaveBeenCalled();
        expect(html).not.toHaveBeenCalled();
      });
    }
  }
});

describe('다이소 위치 경계', () => {
  const coordinates = [
    { latitude: 91, longitude: 127 }, { latitude: -91, longitude: 127 },
    { latitude: 37, longitude: 181 }, { latitude: 37, longitude: -181 },
    { latitude: NaN, longitude: 127 }, { latitude: 37, longitude: Infinity },
    { latitude: Infinity, longitude: 127 }, { latitude: 37, longitude: NaN },
    { latitude: 37 }, { longitude: 127 },
  ];
  for (const tool of [createCheckInventoryTool(), createFindInventoryByNameTool()]) {
    it.each(coordinates)(`${tool.name} 잘못된 위치 %j 거부`, async (location) => {
      await expect(tool.handler({ productId: '1', query: '컵', ...location })).rejects.toThrow();
      expect(json).not.toHaveBeenCalled();
      expect(html).not.toHaveBeenCalled();
    });
  }
  it.each([{ lat: '91', lng: '127' }, { lat: '37', lng: '181' }, { lat: 'NaN', lng: '127' }, { lat: '37abc', lng: '127' }, { lat: '', lng: '127' }, { lat: '37' }, { lng: '127' }])('REST 잘못된 위치 %j 거부', async (location) => {
    const c = createMockContext({ productId: '1', ...location });
    await handleCheckInventory(c);
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }), 400);
    expect(json).not.toHaveBeenCalled();
  });
  it.each([[91, 127, 1, 30], [37, 181, 1, 30], [37, 127, 0, 30], [37, 127, 1, 1.5]])('직접 재고 조회 경계 거부 %j', async (lat, lng, page, pageSize) => {
    await expect(fetchStoreInventory('1', lat, lng, page, pageSize)).rejects.toThrow();
    expect(json).not.toHaveBeenCalled();
  });
  it('기본 위치를 보존하며 큰 유효 페이지를 허용한다', async () => {
    const result = await createCheckInventoryTool().handler({ productId: '1', page: 999, pageSize: 1000 });
    expect(JSON.parse(result.content[0].text as string).location).toEqual({ latitude: 37.5665, longitude: 126.978 });
    expect(json).toHaveBeenCalledWith(expect.stringContaining('/ms/msg/selStr'), expect.objectContaining({ body: expect.stringContaining('37.5665') }));
  });
  it('MCP 스키마를 거친 반쪽 위치도 거부한다', async () => {
    const tool = createCheckInventoryTool();
    const args = z.object(tool.metadata.inputSchema).parse({ productId: '1', latitude: 37 });
    await expect(tool.handler(args)).rejects.toThrow();
    expect(json).not.toHaveBeenCalled();
  });
});

describe('다이소 마지막 페이지 이후', () => {
  it.each(['', '안산 중앙역'])('검색어 %s 결과의 총수를 보존하고 변형으로 넘어가지 않는다', async (keyword) => {
    json.mockResolvedValue({ data: Array.from({ length: 23 }, (_, i) => ({ strCd: String(i) })) });
    expect(await fetchStoreInventory('1', 37, 127, 999, 30, keyword)).toEqual({ stores: [], totalCount: 23 });
    expect(json).toHaveBeenCalledTimes(1);
    expect(auth).not.toHaveBeenCalled();
  });
  it('첫 변형 결과가 없으면 다음 변형의 총수를 보존한다', async () => {
    json.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [{ strCd: '1' }] });
    expect(await fetchStoreInventory('1', 37, 127, 999, 30, '안산 중앙역')).toEqual({ stores: [], totalCount: 1 });
    expect(json).toHaveBeenCalledTimes(2);
    expect(auth).not.toHaveBeenCalled();
  });
});

describe('다이소 유효 경계와 upstream 응답', () => {
  it.each([[-90, -180], [90, 180], [0, 0]])('좌표 경계 %s/%s 허용', async (latitude, longitude) => {
    const c = createMockContext({ productId: '1', lat: String(latitude), lng: String(longitude) });
    await handleCheckInventory(c);
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ location: { latitude, longitude } }) }));
  });
  it('상품명 조회의 기본 위치 유지', async () => {
    json.mockImplementation(async (url: string) => url.includes('FindStoreGoods')
      ? { resultSet: { result: [{ resultDocuments: [{ PD_NO: '1', PDNM: '컵', PD_PRC: '1000' }], totalSize: 1 }] } }
      : { data: [] });
    const result = await createFindInventoryByNameTool().handler({ query: '컵' });
    expect(JSON.parse(result.content[0].text as string).location).toEqual({ latitude: 37.5665, longitude: 126.978, source: 'default' });
  });
  it('누락된 매장 데이터는 빈 결과', async () => {
    json.mockResolvedValue({ success: true });
    expect(await fetchStoreInventory('1', 37, 127)).toEqual({ stores: [], totalCount: 0 });
  });
  it('명시적 매장 검색 실패를 성공으로 바꾸지 않는다', async () => {
    json.mockResolvedValue({ success: false });
    await expect(fetchStoreInventory('1', 37, 127)).rejects.toThrow('매장 검색');
  });
  it('명시적 재고 조회 실패를 성공으로 바꾸지 않는다', async () => {
    json.mockResolvedValue({ data: [{ strCd: '1' }] });
    auth.mockResolvedValue({ success: false });
    await expect(fetchStoreInventory('1', 37, 127)).rejects.toThrow('매장 재고');
  });
  it('재고 미확인 매장을 양수 재고에 포함하지 않는다', async () => {
    json.mockResolvedValue({ data: [{ strCd: '1' }] });
    auth.mockResolvedValue({ data: [] });
    const result = await createCheckInventoryTool().handler({ productId: '1' });
    expect(JSON.parse(result.content[0].text as string).storeInventory).toEqual(expect.objectContaining({ totalStores: 1, inStockCount: 0, unknownStockCount: 1 }));
  });
});
