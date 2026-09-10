import { afterEach, expect, it, vi } from 'vitest';
import { fetchGs25WebStores } from '../../../src/services/gs25/client.js';
import { createFindNearbyStoresTool } from '../../../src/services/gs25/tools/findNearbyStores.js';

afterEach(() => vi.unstubAllGlobals());

it('새 공개 매장 API에서 좌표를 정규화한다', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
    { shopCode: 'VY010', shopName: 'GS25강남', address: '서울 강남구', posX: 127.02, posY: 37.49 },
  ])));
  vi.stubGlobal('fetch', fetchMock);
  const result = await fetchGs25WebStores('강남');
  expect(result.stores[0]).toMatchObject({ storeCode: 'VY010', latitude: 37.49, longitude: 127.02 });
  const url = new URL(fetchMock.mock.calls[0][0]);
  expect(url.origin).toBe('https://www.gsretail.com');
  expect(url.pathname).toBe('/api/homepage/brand/storeSearch/selectGs25Stores');
  expect(url.searchParams.get('shopName')).toBe('강남');
  expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/json');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('예상하지 못한 응답 구조를 빈 매장 목록으로 숨기지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'unavailable' }))));
  await expect(fetchGs25WebStores('강남')).rejects.toThrow();
});

it('MCP에서도 재고 기반 매장이 없으면 공개 매장 검색을 사용한다', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ stores: [] })))
    .mockResolvedValueOnce(new Response(JSON.stringify([
      { shopCode: 'VY010', shopName: 'GS25강남', posX: 127.02, posY: 37.49 },
    ]))));
  const response = await createFindNearbyStoresTool().handler({ keyword: '강남', googleMapsApiKey: '' });
  const result = JSON.parse(response.content[0].text);
  expect(result.stores[0].storeCode).toBe('VY010');
  expect(result.fallbackUsed).toBe(true);
});
