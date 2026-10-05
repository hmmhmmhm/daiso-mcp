import * as daiso from '../../src/services/daiso/client.js';
import * as emart from '../../src/services/emart24/client.js';
import { createCheckInventoryTool as createDaisoTool } from '../../src/services/daiso/tools/checkInventory.js';
import { lookupEmart24Inventory } from '../../src/services/emart24/inventoryLookup.js';
import { afterEach, expect, it, vi } from 'vitest';
import * as gs from '../../src/services/gs25/client.js';
import { createCheckInventoryTool } from '../../src/services/gs25/tools/checkInventory.js';
import { normalizeStore } from '../../src/services/gs25/storeUtils.js';
afterEach(() => vi.restoreAllMocks());
it('all unknown GS stock has a null total and explicit unknown count', async () => {
  vi.spyOn(gs,'fetchGs25Stores').mockResolvedValue({totalCount:1,stores:[normalizeStore({storeCode:'S'})]});
  const result = await createCheckInventoryTool().handler({keyword:'콜라',itemCode:'P'});
  const payload = JSON.parse(result.content[0].text);
  expect(payload.inventory.totalStockQuantity).toBeNull();
  expect(payload.inventory.unknownStockStoreCount).toBe(1);
});

it('Daiso unknown store stock is counted separately', async () => {
  vi.spyOn(daiso,'fetchDaisoJson').mockImplementation(async (url) => {
    if (String(url).includes('selOnlStck')) return {success:true,data:{}} as never;
    if (String(url).includes('/ms/msg/selStr')) return {data:[{strCd:'S',strNm:'매장'}]} as never;
    return {} as never;
  });
  vi.spyOn(daiso,'fetchDaisoJsonWithAuth').mockResolvedValue({success:true,data:[]} as never);
  const result = await createDaisoTool().handler({productId:'P'});
  const payload = JSON.parse(result.content[0].text);
  expect(payload.storeInventory).toMatchObject({unknownStockCount:1,inStockCount:0,outOfStockCount:0});
});
it('Emart missing store detail does not turn an unknown quantity into zero', async () => {
  vi.spyOn(emart,'searchEmart24StockByStores').mockResolvedValue({storeGoodsQty:[{BIZNO:'S'}]} as never);
  vi.spyOn(emart,'fetchEmart24StoreDetail').mockRejectedValue(new Error('detail unavailable'));
  const result = await lookupEmart24Inventory({pluCd:'P',bizNos:['S']});
  expect(result.inventory.stores[0]).toMatchObject({bizQty:null,storeName:''});
});
