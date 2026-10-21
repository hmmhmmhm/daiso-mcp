import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGs25CheckInventory } from '../../src/api/gs25Handlers.js';
import { createCheckInventoryTool } from '../../src/services/gs25/tools/checkInventory.js';
import { ServiceError } from '../../src/core/errors.js';
import type { Gs25Store } from '../../src/services/gs25/types.js';
const mocks = vi.hoisted(() => ({ stores: vi.fn(), products: vi.fn(), geocode: vi.fn() }));
vi.mock('../../src/services/gs25/client.js', async (original) => ({
  ...await original<typeof import('../../src/services/gs25/client.js')>(),
  fetchGs25Stores: mocks.stores, fetchGs25SearchProducts: mocks.products,
  geocodeGs25Address: mocks.geocode,
}));
const message = '요청한 지역의 위치를 확인하지 못했습니다. 좌표를 지정하거나 잠시 후 다시 조회해주세요.';
function store(latitude = 0, longitude = 0, address = '부산 중구 중앙대로 1'): Gs25Store {
  return {
    storeCode: 'B1', storeName: '부산중앙점', address, latitude, longitude,
    realStockQuantity: 1, searchItemName: '콜라', searchItemSellPrice: 1000,
    propertyNames: [], properties: [], phone: '', serviceCode: '01',
    pickupStockQuantity: null, deliveryStockQuantity: null, isSoldOut: false, distanceM: null,
  };
}
function context(query: Record<string, string>) {
  return { env: {}, header: vi.fn(), req: { query: (key: string) => query[key] }, json: vi.fn((data, status = 200) => ({ data, status })) } as unknown as Parameters<typeof handleGs25CheckInventory>[0];
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.stores.mockResolvedValue({ stores: [store()], totalCount: 1, cacheHit: false });
  mocks.geocode.mockResolvedValue(null);
  mocks.products.mockResolvedValue([]);
});

describe('GS25 지정 지역 위치 보호', () => {
  it('MCP는 지역 좌표 확인 실패 시 상품 재고 조회 전에 503을 던진다', async () => {
    const tool = createCheckInventoryTool();
    await expect(tool.handler({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산' })).rejects.toMatchObject({ code: 'GS25_LOCATION_UNRESOLVED', message, status: 503, retryable: true });
    expect(mocks.stores).toHaveBeenCalledTimes(1);
    expect(mocks.stores.mock.calls[0][0]).not.toHaveProperty('itemCode');
    expect(mocks.products).not.toHaveBeenCalled();
  });
  it('REST는 지역 좌표 확인 실패 시 상품 재고 조회 전에 503을 반환한다', async () => {
    const c = context({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산' });
    await handleGs25CheckInventory(c);
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: { code: 'GS25_LOCATION_UNRESOLVED', message }, diagnostics: expect.objectContaining({ status: 503, retryable: true }) }), 503);
    expect(mocks.stores).toHaveBeenCalledTimes(1);
    expect(mocks.stores.mock.calls[0][0]).not.toHaveProperty('itemCode');
    expect(mocks.products).not.toHaveBeenCalled();
  });
  it('MCP는 일치 매장의 한국 좌표를 사용하여 지오코딩을 생략한다', async () => {
    mocks.stores.mockResolvedValue({ stores: [store(35.1, 129.03)], totalCount: 1, cacheHit: false });
    const result = await createCheckInventoryTool().handler({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산' });
    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.stores.mock.calls[1][0]).toMatchObject({ itemCode: 'ITEM', latitude: 35.1, longitude: 129.03 });
    expect(JSON.parse(result.content[0].text)).toMatchObject({ geocodeUsed: false, location: { latitude: 35.1, longitude: 129.03 } });
  });
  it('REST는 직접 변환 실패 후 일치 매장 좌표를 사용하고 주소 변환을 생략한다', async () => {
    mocks.stores.mockResolvedValue({ stores: [store(35.1, 129.03)], totalCount: 1, cacheHit: false });
    const c = context({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산' });
    await handleGs25CheckInventory(c);
    expect(mocks.geocode).toHaveBeenCalledTimes(1);
    expect(mocks.stores.mock.calls[1][0]).toMatchObject({ itemCode: 'ITEM', latitude: 35.1, longitude: 129.03 });
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ geocodeUsed: false, location: { latitude: 35.1, longitude: 129.03 } }) }));
  });
  it('주소가 없어도 일치 매장 자체 좌표를 사용한다', async () => {
    mocks.stores.mockResolvedValue({ stores: [store(35.1, 129.03, '')], totalCount: 1, cacheHit: false });
    await createCheckInventoryTool().handler({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산' });
    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.stores.mock.calls[1][0]).toMatchObject({ latitude: 35.1, longitude: 129.03 });
  });
  it('MCP는 지역 미지정 요청에서 기존 기본 좌표를 유지한다', async () => {
    await createCheckInventoryTool().handler({ keyword: '콜라', itemCode: 'ITEM' });
    expect(mocks.stores.mock.calls[0][0]).toMatchObject({ itemCode: 'ITEM', latitude: 37.4979, longitude: 127.0276 });
  });
  it.each([['MCP', async () => createCheckInventoryTool().handler({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산', latitude: 0, longitude: 0 })], ['REST', async () => {
    const c = context({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산', lat: '0', lng: '0' });
    await handleGs25CheckInventory(c);
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'GS25_LOCATION_UNRESOLVED' }) }), 503);
  }]] as const)('%s 잘못된 지정 좌표를 재고 조회에 전달하지 않는다', async (kind, work) => {
    if (kind === 'MCP') await expect(work()).rejects.toMatchObject({ code: 'GS25_LOCATION_UNRESOLVED' });
    else await work();
    expect(mocks.stores).not.toHaveBeenCalled();
  });
  it('유효한 지정 좌표는 위치 변환 없이 재고 조회한다', async () => {
    await createCheckInventoryTool().handler({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산', latitude: 35.1, longitude: 129.03 });
    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.stores).toHaveBeenCalledTimes(1);
    expect(mocks.stores.mock.calls[0][0]).toMatchObject({ itemCode: 'ITEM', latitude: 35.1, longitude: 129.03 });
  });
  it('릴레이 인증 오류를 위치 미해결 오류로 바꾸지 않는다', async () => {
    mocks.stores.mockRejectedValue(new ServiceError('GS25_AUTH_REQUIRED', '인증이 필요합니다.', 503, false));
    await expect(createCheckInventoryTool().handler({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산' })).rejects.toMatchObject({ code: 'GS25_AUTH_REQUIRED' });
    const c = context({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산' });
    await handleGs25CheckInventory(c);
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'GS25_AUTH_REQUIRED' }) }), 503);
  });
  it('MCP는 주소만 있는 첫 후보보다 뒤의 유효한 매장 좌표를 우선한다', async () => {
    mocks.stores.mockResolvedValueOnce({ stores: [store(), store(35.1, 129.03)], totalCount: 2, cacheHit: false });
    const result = await createCheckInventoryTool().handler({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산' });
    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.stores.mock.calls[1][0]).toMatchObject({ itemCode: 'ITEM', latitude: 35.1, longitude: 129.03 });
    expect(JSON.parse(result.content[0].text)).toMatchObject({ geocodeUsed: false, location: { latitude: 35.1, longitude: 129.03 } });
  });
  it('REST는 주소만 있는 첫 후보보다 뒤의 유효한 매장 좌표를 우선한다', async () => {
    mocks.stores.mockResolvedValueOnce({ stores: [store(), store(35.1, 129.03)], totalCount: 2, cacheHit: false });
    const c = context({ keyword: '콜라', itemCode: 'ITEM', storeKeyword: '부산' });
    await handleGs25CheckInventory(c);
    expect(mocks.geocode).toHaveBeenCalledTimes(1);
    expect(mocks.geocode.mock.calls[0][0]).toBe('부산');
    expect(mocks.stores.mock.calls[1][0]).toMatchObject({ itemCode: 'ITEM', latitude: 35.1, longitude: 129.03 });
    expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ geocodeUsed: false, location: { latitude: 35.1, longitude: 129.03 } }) }));
  });

});

it('MCP는 매장 카탈로그로 좌표를 못 찾으면 지역 검색으로 무료 좌표를 보완한다',async()=>{
 mocks.stores.mockResolvedValueOnce({stores:[],totalCount:0,cacheHit:false});
 mocks.geocode.mockResolvedValueOnce({latitude:37.4979,longitude:127.0276});
 const result=await createCheckInventoryTool().handler({keyword:'콜라',itemCode:'ITEM',storeKeyword:'강남'});
 expect(mocks.geocode).toHaveBeenCalledWith('강남',expect.any(Object));
 expect(mocks.stores.mock.calls[1][0]).toMatchObject({itemCode:'ITEM',latitude:37.4979,longitude:127.0276});
 expect(JSON.parse(result.content[0].text)).toMatchObject({geocodeUsed:true});
});
it('MCP는 후보 주소 변환이 실패해도 지역 검색이 실패하면 기존 미확인 오류를 유지한다',async()=>{
 await expect(createCheckInventoryTool().handler({keyword:'콜라',itemCode:'ITEM',storeKeyword:'부산'})).rejects.toMatchObject({code:'GS25_LOCATION_UNRESOLVED'});
 expect(mocks.geocode.mock.calls.map(call=>call[0])).toEqual(['부산 중구 중앙대로 1','부산']);
 expect(mocks.stores).toHaveBeenCalledTimes(1);
});
