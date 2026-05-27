import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __testOnlyClearOpinetGeocodeCache,
  resolveOpinetLocation,
  wgs84ToKatec,
} from '../../../src/services/opinet/location.js';

afterEach(() => {
  __testOnlyClearOpinetGeocodeCache();
  vi.restoreAllMocks();
});

describe('opinet location', () => {
  it('WGS84 위경도를 KATEC 좌표로 변환한다', () => {
    expect(wgs84ToKatec(37.4979, 127.0276)).toEqual({
      x: 314213.309,
      y: 544413.58,
    });
  });

  it('KATEC 좌표를 직접 받으면 변환 없이 사용한다', async () => {
    await expect(resolveOpinetLocation({ x: 1, y: 2, location: '직접' })).resolves.toEqual({
      katec: { x: 1, y: 2 },
      latitude: null,
      longitude: null,
      location: '직접',
      formattedAddress: null,
      geocodeUsed: false,
      inputType: 'katec',
    });
  });

  it('위경도를 받으면 KATEC 좌표를 함께 반환한다', async () => {
    const result = await resolveOpinetLocation({ latitude: 37.4979, longitude: 127.0276 });

    expect(result).toMatchObject({
      latitude: 37.4979,
      longitude: 127.0276,
      geocodeUsed: false,
      inputType: 'coordinates',
    });
    expect(result.katec.x).toBeCloseTo(314213.309, 3);
  });

  it('location 키워드를 Google Geocoding으로 변환하고 캐시한다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              formatted_address: '서울 강남역',
              geometry: { location: { lat: 37.4979, lng: 127.0276 } },
            },
          ],
        }),
      ),
    );

    const first = await resolveOpinetLocation(
      { location: '강남역' },
      { googleMapsApiKey: 'google-key', fetchImpl },
    );
    const second = await resolveOpinetLocation(
      { location: '강남역' },
      { googleMapsApiKey: 'google-key', fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('address=%EA%B0%95%EB%82%A8%EC%97%AD');
    expect(first).toMatchObject({
      location: '강남역',
      formattedAddress: '서울 강남역',
      geocodeUsed: true,
      inputType: 'location',
    });
    expect(second.katec).toEqual(first.katec);
  });

  it('location 검색에 Google 키가 없으면 명확한 오류를 낸다', async () => {
    await expect(resolveOpinetLocation({ location: '강남역' }, { googleMapsApiKey: '' })).rejects.toThrow(
      'GOOGLE_MAPS_API_KEY',
    );
  });

  it('좌표 변환 실패와 지오코딩 실패를 명확히 처리한다', async () => {
    await expect(() => wgs84ToKatec(Number.NaN, 127)).toThrow('위도/경도');

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ZERO_RESULTS' })))
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('not-json'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'OK', results: [{ geometry: { location: {} } }] })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'OK', results: [{ geometry: { location: { lat: 37.5, lng: 127 } } }] })),
      );

    await expect(
      resolveOpinetLocation({ location: '없는곳' }, { googleMapsApiKey: 'google-key', fetchImpl }),
    ).rejects.toThrow('위치를 좌표로 변환하지 못했습니다');

    await expect(
      resolveOpinetLocation({ location: '장애' }, { googleMapsApiKey: 'google-key', fetchImpl }),
    ).rejects.toThrow('HTTP 502');

    await expect(
      resolveOpinetLocation({ location: '파싱실패' }, { googleMapsApiKey: 'google-key', fetchImpl }),
    ).rejects.toThrow('위치를 좌표로 변환하지 못했습니다');

    await expect(
      resolveOpinetLocation({ location: '좌표없음' }, { googleMapsApiKey: 'google-key', fetchImpl }),
    ).rejects.toThrow('위치를 좌표로 변환하지 못했습니다');

    await expect(
      resolveOpinetLocation({ location: '주소문자열없음' }, { googleMapsApiKey: 'google-key', fetchImpl }),
    ).resolves.toMatchObject({ formattedAddress: null });

    await expect(resolveOpinetLocation({})).rejects.toThrow('location 중 하나');
  });
});
