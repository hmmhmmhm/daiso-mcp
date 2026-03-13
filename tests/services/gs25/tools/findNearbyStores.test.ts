/**
 * GS25 주변 매장 탐색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGs25StoresCache } from '../../../../src/services/gs25/client.js';
import { createFindNearbyStoresTool } from '../../../../src/services/gs25/tools/findNearbyStores.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  clearGs25StoresCache();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createFindNearbyStoresTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createFindNearbyStoresTool();

    expect(tool.name).toBe('gs25_find_nearby_stores');
    expect(tool.metadata.title).toBe('GS25 주변 매장 탐색');
  });

  it('키워드 기준으로 매장 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [
            { storeCode: '1', storeName: '강남역점', storeAddress: '서울 강남구' },
            { storeCode: '2', storeName: '홍대점', storeAddress: '서울 마포구' },
          ],
        }),
      ),
    );

    const tool = createFindNearbyStoresTool();
    const result = await tool.handler({ keyword: '강남', limit: 10 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filteredCount).toBe(1);
    expect(parsed.stores[0].storeCode).toBe('1');
  });

  it('좌표가 있으면 거리 정보를 포함한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [{ storeCode: '1', storeName: '강남역점', storeXCoordination: '127', storeYCoordination: '37.5' }],
        }),
      ),
    );

    const tool = createFindNearbyStoresTool();
    const result = await tool.handler({ latitude: 37.5, longitude: 127, limit: 5 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.location).toEqual({ latitude: 37.5, longitude: 127 });
    expect(parsed.stores[0].distanceM).toBe(0);
  });

  it('좌표가 없고 keyword가 있으면 지오코딩을 시도한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.5, lng: 127 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [{ storeCode: '1', storeName: '강남역점', storeXCoordination: '127', storeYCoordination: '37.5' }],
          }),
        ),
      );

    const tool = createFindNearbyStoresTool();
    const result = await tool.handler({ keyword: '강남역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.geocodeUsed).toBe(true);
    expect(parsed.location).toEqual({ latitude: 37.5, longitude: 127 });

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });
});
