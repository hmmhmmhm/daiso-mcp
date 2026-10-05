import { afterEach, expect, it, vi } from 'vitest';
import { checkSevenElevenInventory } from '../../../src/services/seveneleven/inventory.js';
import { handleSevenElevenCheckInventory } from '../../../src/api/sevenelevenHandlers.js';
import { createCheckInventoryTool } from '../../../src/services/seveneleven/tools/checkInventory.js';
import { Hono } from 'hono';
import type { AppBindings } from '../../../src/api/response.js';
const options = { convenienceRelayUrl: 'https://relay.example', convenienceRelayToken: 'token' };
afterEach(() => vi.unstubAllGlobals());
const prepare = () => vi.stubGlobal('fetch', async (url: string) => {
  if (url.endsWith('seven-goods')) return Response.json({ data: { content: [{ itemCd: '123', itemOnm: '과자' }] } });
  if (url.endsWith('seven-store')) return Response.json({ data: { SearchQueryResult: { Collection: [{ Documentset: { Document: [{ storeCd: 's', storeNm: '점포' }] } }] } } });
  if (url.endsWith('seven-stock-meta')) return Response.json({ itemCd: '123', smCd: '1', stokMngCd: '1', stokMngQty: 1, stockApplicationRate: '1' });
  return Response.json({ data: { storeList: [{ storeCd: 's', stock: -1 }, { storeCd: 'other', stock: 2 }] } });
});
it('선택한 매장의 -1은 미확인으로 남고 품절이나 재고 확인 성공으로 표시하지 않는다', async () => {
  prepare();
  const result = await checkSevenElevenInventory({ productKeyword: '과자', storeKeyword: '점포', storeLimit: 1 }, options);
  expect(result.stockAvailable).toBe(false);
  expect(result.inStockStoreCount).toBe(0);
  expect(result.stores).toEqual([expect.objectContaining({ stockQuantity: -1, isSoldOut: false })]);
});
it('API가 성공해도 선택한 매장 수량이 미확인이면 원인을 추정하지 않는다', async () => {
  prepare();
  const tool = createCheckInventoryTool(undefined, options);
  const result = await tool.handler({ keyword: '과자', storeKeyword: '점포' });
  expect(JSON.stringify(result)).toContain('선택한 매장의 재고 수량을 확인하지 못했습니다');
  const app = new Hono<{ Bindings: AppBindings }>();
  app.get('/inventory', handleSevenElevenCheckInventory);
  const response = await app.request('/inventory?keyword=과자&storeKeyword=점포', undefined, { CONVENIENCE_RELAY_URL: options.convenienceRelayUrl, CONVENIENCE_RELAY_TOKEN: 'token' });
  expect(await response.text()).toContain('선택한 매장의 재고 수량을 확인하지 못했습니다');
});
