import { describe, expect, it, vi } from 'vitest';
import {
  fetchOpinetAveragePrices,
  fetchOpinetLowestStations,
  fetchOpinetStationDetail,
  fetchOpinetStationsAround,
  normalizeFuelCode,
  normalizeOpinetSort,
} from '../../../src/services/opinet/client.js';

describe('opinet client', () => {
  it('전국 평균 유가 응답을 정규화한다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          RESULT: {
            OIL: [
              {
                TRADE_DT: '20260528',
                PRODCD: 'B027',
                PRODNM: '휘발유',
                PRICE: '1667.33',
                DIFF: '-0.23',
              },
            ],
          },
        }),
      ),
    );

    const result = await fetchOpinetAveragePrices({ apiKey: 'key', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.opinet.co.kr/api/avgAllPrice.do?out=json&certkey=key',
      expect.any(Object),
    );
    expect(result.prices[0]).toMatchObject({
      tradeDate: '20260528',
      productCode: 'B027',
      productName: '휘발유',
      price: 1667.33,
      diff: '-0.23',
    });
  });

  it('지역별 최저가 주유소 응답을 정규화한다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          RESULT: {
            OIL: {
              UNI_ID: 'A0010207',
              PRICE: '1745',
              POLL_DIV_CO: 'SKE',
              OS_NM: 'SK서광주유소',
              VAN_ADR: '서울 강남구 역삼동',
              NEW_ADR: '서울 강남구 역삼로',
              GIS_X_COOR: '314871.8',
              GIS_Y_COOR: '544012',
            },
          },
        }),
      ),
    );

    const result = await fetchOpinetLowestStations(
      { fuelCode: 'D047', areaCode: '0113', count: 2 },
      { apiKey: 'key', fetchImpl },
    );

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('prodcd=D047');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('area=0113');
    expect(result.fuelCode).toBe('D047');
    expect(result.stations[0]).toMatchObject({
      stationId: 'A0010207',
      brandCode: 'SKE',
      brandName: 'SK에너지',
      name: 'SK서광주유소',
      price: 1745,
      katecX: 314871.8,
    });
  });

  it('반경 내 주유소 검색 파라미터를 오피넷 형식으로 보낸다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          RESULT: {
            OIL: [
              {
                UNI_ID: 'A0009907',
                POLL_DIV_CD: 'GSC',
                OS_NM: '에너지플러스허브',
                PRICE: '1725',
                DISTANCE: '885.4',
              },
            ],
          },
        }),
      ),
    );

    const result = await fetchOpinetStationsAround(
      { x: 314681.8, y: 544837, radiusMeters: 99999, fuelCode: 'B027', sort: 'distance' },
      { apiKey: 'key', fetchImpl },
    );

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain('radius=5000');
    expect(url).toContain('sort=2');
    expect(result.sort).toBe('distance');
    expect(result.stations[0]?.distanceMeters).toBe(885.4);
  });

  it('주유소 상세 정보를 정규화한다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          RESULT: {
            OIL: {
              UNI_ID: 'A0010207',
              POLL_DIV_CO: 'SKE',
              OS_NM: 'SK서광주유소',
              TEL: '02-562-4855',
              SIGUNCD: '0113',
              LPG_YN: 'N',
              MAINT_YN: 'Y',
              CAR_WASH_YN: 'N',
              CVS_YN: 'Y',
              KPETRO_YN: 'N',
              OIL_PRICE: [
                { PRODCD: 'B027', PRICE: '1745', TRADE_DT: '20260528', TRADE_TM: '101010' },
              ],
            },
          },
        }),
      ),
    );

    const result = await fetchOpinetStationDetail('A0010207', { apiKey: 'key', fetchImpl });

    expect(result.station).toMatchObject({
      stationId: 'A0010207',
      phone: '02-562-4855',
      hasMaintenance: true,
      hasCarWash: false,
      hasConvenienceStore: true,
      isKpetroCertified: false,
    });
    expect(result.station?.prices[0]).toMatchObject({ productCode: 'B027', price: 1745 });
  });

  it('입력값과 오류를 명확히 처리한다', async () => {
    expect(normalizeFuelCode(undefined)).toBe('B027');
    expect(normalizeOpinetSort('2')).toBe('distance');
    expect(() => normalizeFuelCode('BAD')).toThrow('fuelCode');
    await expect(fetchOpinetAveragePrices({ apiKey: '' })).rejects.toThrow('OPINET_API_KEY');
    await expect(fetchOpinetStationsAround({ x: Number.NaN, y: 1 }, { apiKey: 'key' })).rejects.toThrow(
      'KATEC x/y',
    );
    await expect(fetchOpinetStationDetail('', { apiKey: 'key' })).rejects.toThrow('주유소 ID');
  });

  it('HTTP 실패와 JSON 파싱 실패를 오류로 전달한다', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not-json', { status: 503 }));

    await expect(fetchOpinetAveragePrices({ apiKey: 'key', fetchImpl })).rejects.toThrow('HTTP 503');
  });

  it('빈 응답과 기본값 분기를 안정적으로 처리한다', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('not-json'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ RESULT: {} })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            RESULT: {
              OIL: [
                null,
                {
                  UNI_ID: 123,
                  POLL_DIV_CD: 'ZZZ',
                  OS_NM: '무상표',
                  PRICE: '',
                  DISTANCE: 'bad',
                },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ RESULT: {} })));

    await expect(fetchOpinetAveragePrices({ apiKey: 'key', fetchImpl })).resolves.toMatchObject({
      count: 0,
    });
    await expect(fetchOpinetLowestStations({}, { apiKey: 'key', fetchImpl })).resolves.toMatchObject({
      fuelCode: 'B027',
      areaCode: null,
      count: 0,
    });

    const around = await fetchOpinetStationsAround(
      { x: 1, y: 2, radiusMeters: 1, sort: 'price' },
      { apiKey: 'key', fetchImpl },
    );
    expect(String(fetchImpl.mock.calls[2]?.[0])).toContain('radius=100');
    expect(String(fetchImpl.mock.calls[2]?.[0])).toContain('sort=1');
    expect(around.stations[1]).toMatchObject({
      stationId: '123',
      brandName: 'ZZZ',
      price: null,
      distanceMeters: null,
    });

    await expect(fetchOpinetStationDetail('A0', { apiKey: 'key', fetchImpl })).resolves.toMatchObject({
      station: null,
    });
  });
});
