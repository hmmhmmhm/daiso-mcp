/**
 * 롯데시네마 주변 지점 탐색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testOnlyClearLotteCinemaLocationCaches } from '../../../../src/services/lottecinema/location.js';
import { createFindNearbyTheatersTool } from '../../../../src/services/lottecinema/tools/findNearbyTheaters.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  __testOnlyClearLotteCinemaLocationCaches();
});

afterEach(() => {
  vi.restoreAllMocks();
  __testOnlyClearLotteCinemaLocationCaches();
});

describe('createFindNearbyTheatersTool', () => {
  it('거리순 지점을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          IsOK: true,
          Cinemas: {
            Cinemas: {
              Items: [
                {
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  DivisionCode: '1',
                  DetailDivisionCode: '0001',
                  Latitude: '37.5132941',
                  Longitude: '127.104215',
                  CinemaAddrSummary: '서울 송파구 올림픽로 300',
                },
                {
                  CinemaID: '1001',
                  CinemaNameKR: '건대입구',
                  DivisionCode: '1',
                  DetailDivisionCode: '0001',
                  Latitude: '37.5405',
                  Longitude: '127.0693',
                  CinemaAddrSummary: '서울 광진구 아차산로 262',
                },
              ],
            },
          },
          Movies: { Movies: { Items: [] } },
        }),
      ),
    );

    const tool = createFindNearbyTheatersTool();
    const result = await tool.handler({ latitude: 37.5132941, longitude: 127.104215, limit: 2 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.count).toBe(2);
    expect(parsed.theaters[0].theaterId).toBe('1016');
    expect(parsed.theaters[0].distanceKm).toBe(0);
  });

  it('위치 키워드로도 주변 지점을 찾는다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구 고잔동 535',
                geometry: {
                  location: { lat: 37.3172, lng: 126.839 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            IsOK: true,
            Cinemas: {
              Cinemas: {
                Items: [
                  {
                    CinemaID: '9001',
                    CinemaNameKR: '안산중앙',
                    DivisionCode: '9',
                    DetailDivisionCode: '0001',
                    Latitude: '37.3172',
                    Longitude: '126.839',
                    CinemaAddrSummary: '경기 안산시 단원구 고잔동 중앙대로 123',
                  },
                ],
              },
            },
            Movies: { Movies: { Items: [] } },
          }),
        ),
      );

    const tool = createFindNearbyTheatersTool('test-google-key');
    const result = await tool.handler({ keyword: '안산 중앙역', limit: 1 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.keyword).toBe('안산 중앙역');
    expect(parsed.geocodeUsed).toBe(true);
    expect(parsed.theaters[0].theaterId).toBe('9001');
  });

  it('위치 정보가 없으면 서울 시청 좌표를 기본값으로 사용한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          IsOK: true,
          Cinemas: {
            Cinemas: {
              Items: [
                {
                  CinemaID: '1016',
                  CinemaNameKR: '월드타워',
                  DivisionCode: '1',
                  DetailDivisionCode: '0001',
                  Latitude: '37.5132941',
                  Longitude: '127.104215',
                  CinemaAddrSummary: '서울 송파구 올림픽로 300',
                },
              ],
            },
          },
          Movies: { Movies: { Items: [] } },
        }),
      ),
    );

    const tool = createFindNearbyTheatersTool();
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.latitude).toBe(37.5665);
    expect(parsed.longitude).toBe(126.978);
  });
});
