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
  it('재고 API 인증 실패 시 공개 키워드 검색으로 복구한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { shopCode: 'VY010', shopName: 'GS25강남', posX: 127.02, posY: 37.49 },
      ])));
    const response = await createFindNearbyStoresTool().handler({ keyword: '강남' });
    expect(JSON.parse(response.content[0].text)).toMatchObject({
      fallbackUsed: true, stores: [{ storeCode: 'VY010' }],
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 200])('원본 %s 이후 공개 검색 실패를 호출자에게 전달한다', async (status) => {
    mockFetch.mockResolvedValueOnce(new Response('{"stores":[]}', { status }))
      .mockImplementation(() => Promise.resolve(new Response('public unavailable', { status: 503 })));
    await expect(createFindNearbyStoresTool().handler({ keyword: '강남' })).rejects.toThrow('503');
  });

  it('좌표만 주어진 인증 실패는 공개 검색으로 숨기지 않는다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(createFindNearbyStoresTool().handler({ latitude: 37.5, longitude: 127 }))
      .rejects.toThrow('인증');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('일반 전송 오류는 공개 검색으로 숨기지 않는다', async () => {
    mockFetch.mockRejectedValue(new Error('network failed'));
    await expect(createFindNearbyStoresTool().handler({ keyword: '강남' })).rejects.toThrow('network failed');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('인증 실패 후 공개 검색이 비면 추가 재고 조회 없이 빈 결과를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('[]'));
    const response = await createFindNearbyStoresTool().handler({ keyword: '강남', latitude: 37.5, longitude: 127 });
    expect(JSON.parse(response.content[0].text)).toMatchObject({ count: 0, fallbackUsed: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

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

  it('지오코딩이 성공하면 좌표 기반 매장 조회를 사용하고 키워드 필터가 비어도 가까운 매장을 반환한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.4979, lng: 127.0276 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [
              {
                storeCode: 'near',
                storeName: '역삼센터점',
                storeAddress: '서울 테헤란로',
                storeXCoordination: '127.0276',
                storeYCoordination: '37.4979',
              },
              {
                storeCode: 'far',
                storeName: '부산해운대점',
                storeAddress: '부산 해운대구',
                storeXCoordination: '129.16',
                storeYCoordination: '35.16',
              },
            ],
          }),
        ),
      );

    const tool = createFindNearbyStoresTool();
    const result = await tool.handler({ keyword: '강남', limit: 5 });

    const storeUrl = new URL(String(mockFetch.mock.calls[1]?.[0]));
    expect(storeUrl.searchParams.get('centerPositionYCoordination')).toBe('37.4979');
    expect(storeUrl.searchParams.get('centerPositionXCoordination')).toBe('127.0276');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filterRelaxed).toBe(true);
    expect(parsed.count).toBe(2);
    expect(parsed.stores[0].storeCode).toBe('near');

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });

  it('좌표 기반 매장 조회가 비면 상품 재고 조회를 이용해 가까운 GS25 매장으로 대체한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.4979, lng: 127.0276 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ stores: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [
              {
                storeCode: 'near',
                storeName: 'GS25강남메트로점',
                storeAddress: '서울 강남구',
                storeXCoordination: '127.0276',
                storeYCoordination: '37.4979',
              },
            ],
          }),
        ),
      );

    const tool = createFindNearbyStoresTool();
    const result = await tool.handler({ keyword: '강남', limit: 3 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.fallbackUsed).toBe(true);
    expect(parsed.count).toBe(1);
    expect(parsed.stores[0].storeCode).toBe('near');

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });

  it('좌표 기반 매장 조회가 비고 fallback 재고 조회가 실패해도 빈 매장 결과를 반환한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.4979, lng: 127.0276 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ stores: [] })))
      .mockRejectedValueOnce(new Error('fallback stock unavailable'))
      .mockRejectedValueOnce(new Error('fallback stock unavailable'))
      .mockResolvedValueOnce(new Response('[]'));

    const tool = createFindNearbyStoresTool();
    const result = await tool.handler({ keyword: '강남', limit: 3 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.fallbackUsed).toBe(true);
    expect(parsed.count).toBe(0);

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });

  it('fallback 상품 재고 조회도 비면 빈 매장 결과를 반환한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.4979, lng: 127.0276 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ stores: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stores: [] })))
      .mockResolvedValueOnce(new Response('[]'));

    const tool = createFindNearbyStoresTool();
    const result = await tool.handler({ keyword: '강남', limit: 3 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.fallbackUsed).toBe(true);
    expect(parsed.count).toBe(0);

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });
});
