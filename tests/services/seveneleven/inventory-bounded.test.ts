import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkSevenElevenInventory } from '../../../src/services/seveneleven/inventory.js';
import { clearSevenElevenReadCache } from '../../../src/services/seveneleven/readCache.js';
import { createCheckInventoryTool } from '../../../src/services/seveneleven/tools/checkInventory.js';
import { handleSevenElevenCheckInventory } from '../../../src/api/sevenelevenHandlers.js';
import { Hono } from 'hono';
import type { AppBindings } from '../../../src/api/response.js';

const relay = { convenienceRelayUrl: 'https://relay.example', convenienceRelayToken: 'token' };
let codes: string[];
let requested: string[][];
let quotaAt: number | undefined;
let failureAt: number | undefined;
let failAll: boolean;

beforeEach(() => {
  clearSevenElevenReadCache();
  requested = [];
  quotaAt = undefined;
  failureAt = undefined;
  failAll = false;
  codes = ['first', 'far', 'near', 'unknown'];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('seven-goods') || url.endsWith('/search/goods')) {
      return Response.json({ data: { content: [{ itemCd: '123', itemOnm: '과자' }] } });
    }
    if (url.endsWith('seven-store') || url.endsWith('/search/store')) {
      return Response.json({ data: { SearchQueryResult: { Collection: [{ Documentset: {
        Document: codes.map((storeCd, index) => ({ storeCd, storeNm: '점포',
          latitude: [37, 38, 37.001][index] ?? 0, longitude: index >= 3 ? 0 : 127 })),
      } }] } } });
    }
    if (url.endsWith('seven-stock-meta') || url.includes('/product/search/stock')) {
      return Response.json({ itemCd: '123', smCd: '1', stokMngCd: '1', stokMngQty: 1, stockApplicationRate: '100' });
    }
    const { storeList } = JSON.parse(init.body as string);
    requested.push(storeList);
    if (requested.length === quotaAt) return Response.json({}, { status: 429, headers: {
      'x-relay-quota-reason': 'minute', 'retry-after': '30',
    } });
    if (failAll || requested.length === failureAt) return Response.json({ code: 501, message: '정상적인 점포 조회 요청이 아닙니다.' }, { status: 400 });
    if (storeList.length !== 1) return Response.json({ code: 501, message: '정상적인 점포 조회 요청이 아닙니다.' }, { status: 400 });
    return Response.json({ success: true, data: { storeList: [{ storeCd: storeList[0],
      stock: { first: 0, near: 3, far: -1, unknown: '미확인' }[storeList[0] as string] }] } });
  });
});
afterEach(() => vi.unstubAllGlobals());

it.each([{}, relay])('가까운 점포를 먼저 제한하고 직접/중계에서 점포별로 호출한다 (%j)', async (options) => {
  const result = await checkSevenElevenInventory({ productKeyword: '과자', storeKeyword: '점포', storeLimit: 2 }, options);
  expect(requested).toEqual([['first'], ['near']]);
  expect(result.totalStoreCount).toBe(4);
  expect(result.stores.map((store) => [store.storeCode, store.stockQuantity, store.isSoldOut])).toEqual([
    ['first', 0, true], ['near', 3, false],
  ]);
  expect(result.stockAvailable).toBe(true);
  expect(result.stockError).toBeNull();
});

it('알 수 없는 수량을 품절로 바꾸지 않는다', async () => {
  const result = await checkSevenElevenInventory({ productKeyword: '과자', storeKeyword: '점포', storeLimit: 4 }, relay);
  expect(requested).toEqual([['first'], ['near'], ['far'], ['unknown']]);
  expect(result.stores.slice(2).map((store) => [store.stockQuantity, store.isSoldOut])).toEqual([[-1, false], [-1, false]]);
});

it('단일 점포 실패 원문과 다른 점포 성공 수량을 보존한다', async () => {
  failureAt = 2;
  const result = await checkSevenElevenInventory({ productKeyword: '과자', storeKeyword: '점포', storeLimit: 3 });
  expect(requested).toEqual([['first'], ['near'], ['far']]);
  expect(result.stockError).toMatchObject({ cause: 'api', httpStatus: 400, code: 501, message: '정상적인 점포 조회 요청이 아닙니다.' });
  expect(result.stores.map((store) => store.stockQuantity)).toEqual([0, -1, -1]);
});

it('중계 쿼터가 소진되면 남은 점포 호출을 중단한다', async () => {
  quotaAt = 2;
  await expect(checkSevenElevenInventory({ productKeyword: '과자', storeKeyword: '점포', storeLimit: 4 }, relay)).rejects.toMatchObject({ status: 429 });
  expect(requested).toEqual([['first'], ['near']]);
});

it('직접 API의 429도 원문을 남기고 추가 점포 호출을 중단한다', async () => {
  quotaAt = 2;
  const result = await checkSevenElevenInventory({ productKeyword: '과자', storeKeyword: '점포', storeLimit: 4 });
  expect(requested).toEqual([['first'], ['near']]);
  expect(result.stockError).toMatchObject({ cause: 'api', httpStatus: 429 });
  expect(result.stores.map((store) => store.stockQuantity)).toEqual([0, -1, -1, -1]);
});

it('매장 제한이 0이면 재고 API를 호출하지 않는다', async () => {
  const result = await checkSevenElevenInventory({ productKeyword: '과자', storeKeyword: '점포', storeLimit: 0 }, relay);
  expect(requested).toEqual([]);
  expect(result.stores).toEqual([]);
  expect(result.totalStoreCount).toBe(4);
});

it('점포 요청 거절 code 501을 MCP와 REST에서 암호화 오류로 추정하지 않는다', async () => {
  failureAt = 1;
  const toolResult = await createCheckInventoryTool().handler({ keyword: '과자', storeKeyword: '점포', storeLimit: 1 });
  const toolData = JSON.parse(toolResult.content[0].text);
  expect(toolData.stockAvailable).toBe(false);
  expect(toolData.note).toContain('정상적인 점포 조회 요청이 아닙니다.');
  expect(toolData.note).not.toContain('암호화');
  requested = [];
  const app = new Hono<{ Bindings: AppBindings }>();
  app.get('/inventory', handleSevenElevenCheckInventory);
  const response = await app.request('/inventory?keyword=과자&storeKeyword=점포&storeLimit=1');
  const data = await response.json() as { data: { stockError: { code: number }; note: string } };
  expect(data.data.stockError.code).toBe(501);
  expect(data.data.note).toContain('정상적인 점포 조회 요청이 아닙니다.');
  expect(data.data.note).not.toContain('암호화');
});

it('기본 제한 20은 후보가 많아도 20개 점포만 호출한다', async () => {
  codes = Array.from({ length: 25 }, (_, index) => `store-${index}`);
  const result = await checkSevenElevenInventory({ productKeyword: '과자', storeKeyword: '점포' }, relay);
  expect(requested).toHaveLength(20);
  expect(requested.every((storeList) => storeList.length === 1)).toBe(true);
  expect(result.totalStoreCount).toBe(25);
  expect(result.stores).toHaveLength(20);
  expect(result.stockAvailable).toBe(false);
  expect(result.stores.every((store) => store.stockQuantity === -1 && !store.isSoldOut)).toBe(true);
});

it('모든 점포 호출이 실패해도 수량은 0으로 바꾸지 않고 오류를 보존한다', async () => {
  failAll = true;
  const result = await checkSevenElevenInventory({ productKeyword: '과자', storeKeyword: '점포', storeLimit: 3 });
  expect(requested).toEqual([['first'], ['near'], ['far']]);
  expect(result.stockAvailable).toBe(false);
  expect(result.inStockStoreCount).toBe(0);
  expect(result.stockError).toMatchObject({ code: 501, httpStatus: 400 });
  expect(result.stores.every((store) => store.stockQuantity === -1 && !store.isSoldOut)).toBe(true);
});
