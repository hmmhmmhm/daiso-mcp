import { it, expect, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { fetchOnlineStock, fetchStoreInventory } from '../../src/services/daiso/tools/checkInventory.ts';
import { fetchCuStores } from '../../src/services/cu/client.ts';
import { createCheckInventoryTool as createCuInventoryTool } from '../../src/services/cu/tools/checkInventory.ts';
import { lookupEmart24Inventory } from '../../src/services/emart24/inventoryLookup.ts';
import { searchEmart24Products } from '../../src/services/emart24/client.ts';
import { searchSevenElevenProductsWithVariants } from '../../src/services/seveneleven/productKeyword.ts';
import { checkSevenElevenInventory } from '../../src/services/seveneleven/inventory.ts';
import { clearSevenElevenReadCache } from '../../src/services/seveneleven/readCache.ts';
import { normalizeStore } from '../../src/services/gs25/storeUtils.ts';


const originalFetch = globalThis.fetch;
const json = (value: unknown) => new Response(JSON.stringify(value));
const urlOf = (input: RequestInfo | URL) => input instanceof Request ? input.url : String(input);
const unexpected = (url: string): never => { throw new Error(`Unexpected mocked request: ${url}`); };
afterEach(() => { globalThis.fetch=originalFetch; clearSevenElevenReadCache(); });
it('daiso success false is an error', async () => {
  globalThis.fetch = async () => json({ success: false, message: 'fixture lookup failure' });
  await expect(fetchOnlineStock('P')).rejects.toThrow();
  globalThis.fetch = async input => {
    const url = urlOf(input);
    if (url.includes('/auth/request')) return new Response('fixture-token', { headers: { 'x-dm-uid': 'fixture-uid' } });
    if (url.includes('selStrPkupStck')) return json({ success: false, message: 'fixture lookup failure' });
    if (url.includes('/ms/msg/selStr')) return json({ data: [{ strCd: 'S', strNm: 'fixture store' }] });
    return unexpected(url);
  };

  await expect(fetchStoreInventory('P',37,127)).rejects.toThrow();


});
it('CU prefers exact product candidate', async () => {
  let cuSeed = '';
  globalThis.fetch = async (input, init) => {
    const url = urlOf(input);
    const body = JSON.parse(String(init?.body || '{}'));
    if ('prevSearchWord' in body) return json({ data: { stockResult: { result: { rows: [
      { fields: { item_cd: 'WRONG', item_nm: '콜라제로' } },
      { fields: { item_cd: 'RIGHT', item_nm: '콜라' } },
    ] } } } });
    if (body.itemCd) { cuSeed = body.itemCd; return json({ storeList: [] }); }
    if (url.includes('display')) return json({});
    // The stock screen warm-up is intentionally allowed without live I/O.
    if (init?.method === 'POST' && Object.keys(body).length === 0) return json({});
    return unexpected(url);
  };
  const cu = JSON.parse((await createCuInventoryTool().handler({ keyword: '콜라', latitude: 37.5, longitude: 127 })).content[0].text);
  assert.equal(cuSeed, 'RIGHT');
  assert.equal(cu.nearbyStores.stockItemCode, 'RIGHT');
  expect(cu.nearbyStores.selectionReason).toBe('exact_match');


});
it('Emart24 prefers exact product candidate', async () => {
  let emartPlu = '';
  globalThis.fetch = async (input, init) => {
    const url = urlOf(input);
    if (init?.method === 'POST') return json({ productList: [
      { pluCd: 'WRONG', goodsNm: '콜라제로' }, { pluCd: 'RIGHT', goodsNm: '콜라' },
    ] });
    if (url.includes('/stock-search/store')) { emartPlu = new URL(url).searchParams.get('searchPluCode') || ''; return json({ storeGoodsQty: [] }); }
    return unexpected(url);
  };
  const emartSelection = await lookupEmart24Inventory({ keyword: '콜라', bizNos: ['S'] });
  assert.equal(emartSelection.pluCd, 'RIGHT');
  expect(emartSelection.selectionReason).toBe('exact_match');
  assert.equal(emartPlu, 'RIGHT');


});
it('Seven respects unmatched requested region', async () => {
  clearSevenElevenReadCache();
  globalThis.fetch = async input => {
    const url = urlOf(input);
    if (url.includes('/search/goods')) return json({ success: true, data: { content: [{ itemCd: 'P', itemOnm: '콜라' }] } });
    if (url.includes('/search/store')) return json({ success: true, data: { SearchQueryResult: { Collection: [{ Documentset: { Document: [
      { storeCd: 'S', storeNm: '서울강남점', address: '서울 강남구', latitude: 37.5, longitude: 127 },
    ] } }] } } });
    if (url.includes('/real-stock/')) return json({ success: true, data: { storeList: [{ storeCd: 'S', stock: 5 }] } });
    if (url.includes('itemCd=P')) return json({ itemCd: 'P', smCd: 'M', stokMngCd: 'M' });
    return unexpected(url);
  };
  const sevenLocation = await checkSevenElevenInventory({ productKeyword: '콜라', storeKeyword: '부산 해운대' });


  expect(sevenLocation.stores).toEqual([]);
  expect(sevenLocation.stockAvailable).toBe(false);
});
it('Seven paginates the complete deduplicated corpus', async () => {
  clearSevenElevenReadCache();
  let body: unknown;
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return json({ success: true, data: { SearchQueryResult: { Collection: [{ CollectionId: 'offline', Documentset: {
    totalCount: 7, Document: Array.from({ length: 7 }, (_, index) => ({ field: { itemCd: String(index + 1), itemOnm: '콜라' } })),
  } }] } } });
  };
  const sevenPage = await searchSevenElevenProductsWithVariants('콜라', { page: 2, size: 3 });
  expect(sevenPage.totalCount).toBe(7);
  expect(sevenPage.products.map(p => p.itemCode)).toEqual(['4', '5', '6']);
  expect(body).toEqual({ collection: 'goods', query: '콜라', sort: 'quantity/desc,itemOnm/asc', startCount: 0, listCount: 100 });
});
it('Emart24 absent quantity remains unknown', async () => {
  globalThis.fetch = async input => {
    const url = urlOf(input);
    if (url.includes('/stock-search/store') || url.includes('/stock/store/')) return json({});
    return unexpected(url);
  };
  const emartMissing = await lookupEmart24Inventory({ pluCd: 'P', bizNos: ['S'], includeRequestedStoresWithoutQty: true });
  assert.equal(emartMissing.inventory.stores[0].bizQty, null);
  assert.equal(emartMissing.inventory.goodsInfo, null);


});
it('CU metadata has unknown stock', async () => {
  globalThis.fetch = async () => new Response(`<tr><span class="name">fixture store</span><address><a href="#">fixture address</a></address><a onclick="searchLatLng('x', 'S')"></a></tr>`);
  const cuWeb = await fetchCuStores({ searchWord: 'fixture' });
  assert.equal(cuWeb.stores.length, 1);
  assert.equal(cuWeb.stores[0].stock, null);


});
it('GS25 metadata has unknown stock', async () => {
  const gs = normalizeStore({ storeCode: 'S', storeName: 'fixture' });
  assert.equal(gs.realStockQuantity, null);


});
it('Emart24 enforces requested page size', async () => {
  let requestedPageCnt = '';
  globalThis.fetch = async (_input, init) => {
    requestedPageCnt = new URLSearchParams(String(init?.body)).get('pageCnt') || '';
    return json({ totalCnt: 10, productList: Array.from({ length: 10 }, (_, i) => ({ pluCd: `P${i}`, goodsNm: `fixture ${i}` })) });
  };
  const emartSize = await searchEmart24Products({ keyword: 'fixture', pageSize: 3 });
  assert.equal(requestedPageCnt, '3');
  assert.equal(emartSize.products.length, 3);


});
it.each(['5bad', -2, 1.5])('Seven invalid stock %s remains unknown', async (stock) => {
  clearSevenElevenReadCache();
  globalThis.fetch = async input => {
    const url = urlOf(input);
    if (url.includes('/search/goods')) return json({ success: true, data: { content: [{ itemCd: 'P', itemOnm: '콜라' }] } });
    if (url.includes('/search/store')) return json({ success: true, data: { SearchQueryResult: { Collection: [{ Documentset: { Document: [
      { storeCd: 'S', storeNm: '서울강남점', address: '서울 강남구', latitude: 37.5, longitude: 127 },
    ] } }] } } });
    if (url.includes('/real-stock/')) return json({ success: true, data: { storeList: [{ storeCd: 'S', stock }] } });
    if (url.includes('itemCd=P')) return json({ itemCd: 'P', smCd: 'M', stokMngCd: 'M' });
    return unexpected(url);
  };
  const sevenLocation = await checkSevenElevenInventory({ productKeyword: '콜라', storeKeyword: '서울 강남' });


  expect(sevenLocation.stores[0].stockQuantity).toBe(-1);
  expect(sevenLocation.stores[0].isSoldOut).toBe(false);
  expect(sevenLocation.stockAvailable).toBe(false);
});

it('Daiso store search explicit failure is not empty inventory', async () => {
  globalThis.fetch = async () => json({success:false});
  await expect(fetchStoreInventory('P',37,127)).rejects.toThrow('매장 검색');
});

it('Daiso empty successful store search stays empty', async () => {
  globalThis.fetch = async () => json({success:true});
  expect(await fetchStoreInventory('P',37,127)).toEqual({stores:[],totalCount:0});
});
