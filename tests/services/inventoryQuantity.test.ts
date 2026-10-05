import { expect, it } from 'vitest';
import { parseInventoryQuantity } from '../../src/services/inventoryQuantity.js';
import { normalizeStore, sortGs25Stores, extractGs25ProductCandidates } from '../../src/services/gs25/storeUtils.js';
import { selectCuStockItem, cuStockSelectionReason } from '../../src/services/cu/productSelection.js';

it.each([undefined, null, {}, false, '', ' ', '3bad', 'bad', -1, 1.5, NaN, Infinity])('unknown quantity %s does not become zero', (value) => {
  expect(parseInventoryQuantity(value)).toBeNull();
});
it.each([0, '0', 7, '7'])('valid quantity %s is preserved', (value) => {
  expect(parseInventoryQuantity(value)).toBe(Number(value));
});
it('missing GS stock does not assert sold out, even when a stale flag says Y', () => {
  expect(normalizeStore({isSoldOutYn:'Y'})).toMatchObject({realStockQuantity:null,isSoldOut:false});
  expect(normalizeStore({realStockQuantity:0,isSoldOutYn:'Y'})).toMatchObject({realStockQuantity:0,isSoldOut:true});
});
it('CU skips invalid codes and supports absent or broad candidates', () => {
  expect(selectCuStockItem([], '콜라')).toBeNull();
  const item = {itemCode:'C', itemName:' 콜 라 '} as never;
  expect(selectCuStockItem([{itemCode:' ',itemName:'콜라'} as never,item], '콜라')).toBe(item);
  expect(selectCuStockItem([item], '음료')).toBe(item);
});

it('CU selection reason distinguishes exact, broad and absent candidates', () => {
  const item = {itemCode:'C',itemName:' 콜 라 '} as never;
  expect(cuStockSelectionReason(item,'콜라')).toBe('exact_match');
  expect(cuStockSelectionReason(item,'음료')).toBe('first_candidate');
  expect(cuStockSelectionReason(null,'음료')).toBeNull();
});

it.each([42.7, Infinity, false])('GS price normalization remains independent from stock %s', (price) => {
  expect(normalizeStore({searchItemSellPrice:price as never}).searchItemSellPrice).toBe(price === 42.7 ? 42 : 0);
});

it('GS unknown quantities sort behind known stores and do not add confirmed stock', () => {
  const unknown = normalizeStore({storeCode:'U',storeName:'미확인',searchItemName:'콜라'});
  const known = normalizeStore({storeCode:'K',storeName:'확인',realStockQuantity:2,searchItemName:'콜라'});
  expect(sortGs25Stores([unknown,known])[0].storeCode).toBe('K');
  expect(sortGs25Stores([known,unknown])[0].storeCode).toBe('K');
  const candidates = extractGs25ProductCandidates([unknown,unknown,known]);
  expect(candidates[0]).toMatchObject({totalStockQuantity:2,inStockStoreCount:1});
});
it('GS product candidates distinguish all unknown from confirmed zero and partial sums', () => {
  const unknown = normalizeStore({storeCode:'U',searchItemName:'콜라'});
  const zero = normalizeStore({storeCode:'Z',realStockQuantity:0,searchItemName:'콜라'});
  const known = normalizeStore({storeCode:'K',realStockQuantity:3,searchItemName:'콜라'});
  expect(extractGs25ProductCandidates([unknown,unknown])[0]).toMatchObject({totalStockQuantity:null,unknownStockStoreCount:2});
  expect(extractGs25ProductCandidates([zero])[0]).toMatchObject({totalStockQuantity:0,unknownStockStoreCount:0});
  expect(extractGs25ProductCandidates([unknown,known])[0]).toMatchObject({totalStockQuantity:3,unknownStockStoreCount:1});
  expect(extractGs25ProductCandidates([known,unknown])[0]).toMatchObject({totalStockQuantity:3,unknownStockStoreCount:1});
});
it('GS known zero candidates rank ahead of unknown totals in either input order', () => {
  const unknown = normalizeStore({searchItemName:'미확인'});
  const zero = normalizeStore({searchItemName:'확인',realStockQuantity:0});
  expect(extractGs25ProductCandidates([unknown,zero])[0].name).toBe('확인');
  expect(extractGs25ProductCandidates([zero,unknown])[0].name).toBe('확인');
});
