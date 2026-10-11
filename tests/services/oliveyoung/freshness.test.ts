import { beforeEach, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/oliveyoung/transport.js', () => ({ requestOliveyoung: request }));
import {
  __testOnlyClearOliveyoungCaches,
  fetchOliveyoungProducts,
  fetchOliveyoungStores,
  enrichOliveyoungProductsWithNearbyStoreInventory,
} from '../../../src/services/oliveyoung/client.js';
const productsParams = { keyword: '선크림', page: 1, size: 1, sort: '01', includeSoldOut: false };
const storesParams = { latitude: 37.5, longitude: 127, pageIdx: 1, searchWords: '' };
const enrichParams = { latitude: 37.5, longitude: 127, storeKeyword: '', maxProducts: 1 };
beforeEach(() => {
  request.mockReset();
  __testOnlyClearOliveyoungCaches();
});
it.each(['products', 'stores'])(
  'fresh %s rejects upstream failure after warming stale fallback',
  async (operation) => {
    request.mockResolvedValueOnce({ status: 'SUCCESS', data: {} });
    const call = () =>
      operation === 'products'
        ? fetchOliveyoungProducts(productsParams)
        : fetchOliveyoungStores(storesParams);
    await call();
    request.mockRejectedValue(new Error('upstream blocked'));
    await expect(
      operation === 'products'
        ? fetchOliveyoungProducts(productsParams, { bypassCache: true })
        : fetchOliveyoungStores(storesParams, { bypassCache: true }),
    ).rejects.toThrow('upstream blocked');
  },
);
it('fresh inventory re-reads product identifiers and propagates stock failures', async () => {
  request.mockResolvedValueOnce({
    status: 'SUCCESS',
    data: { serachList: [{ goodsNumber: 'A1' }] },
  });
  const products = (await fetchOliveyoungProducts(productsParams)).products;
  request
    .mockResolvedValueOnce({ status: 'SUCCESS', data: { goodsInfo: { masterGoodsNumber: 'M1' } } })
    .mockResolvedValueOnce({ status: 'SUCCESS', data: { storeList: [] } });
  await enrichOliveyoungProductsWithNearbyStoreInventory(products, enrichParams);
  request
    .mockResolvedValueOnce({ status: 'SUCCESS', data: { goodsInfo: { masterGoodsNumber: 'M1' } } })
    .mockRejectedValueOnce(new Error('stock blocked'));
  await expect(
    enrichOliveyoungProductsWithNearbyStoreInventory(products, enrichParams, { bypassCache: true }),
  ).rejects.toThrow('stock blocked');
  expect(request.mock.calls.filter(([path]) => path.endsWith('stock-goods-info-v3'))).toHaveLength(
    2,
  );
});
it('fresh inventory propagates identifier lookup failures', async () => {
  request.mockResolvedValueOnce({
    status: 'SUCCESS',
    data: { serachList: [{ goodsNumber: 'A1' }] },
  });
  const products = (await fetchOliveyoungProducts(productsParams)).products;
  request.mockRejectedValueOnce(new Error('goods blocked'));
  await expect(
    enrichOliveyoungProductsWithNearbyStoreInventory(products, enrichParams, { bypassCache: true }),
  ).rejects.toThrow('goods blocked');
});
it('fresh inventory rejects a missing identifier rather than returning unchecked inventory', async () => {
  request.mockResolvedValueOnce({
    status: 'SUCCESS',
    data: { serachList: [{ goodsNumber: 'A1' }] },
  });
  const products = (await fetchOliveyoungProducts(productsParams)).products;
  request.mockResolvedValueOnce({ status: 'SUCCESS', data: { goodsInfo: {} } });
  await expect(
    enrichOliveyoungProductsWithNearbyStoreInventory(products, enrichParams, { bypassCache: true }),
  ).rejects.toThrow('상품 식별자');
});
