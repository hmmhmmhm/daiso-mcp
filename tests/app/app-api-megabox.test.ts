/**
 * 앱 통합 테스트 - 메가박스 API
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';
import { __testOnlyClearMegaboxLocationCaches } from '../../src/services/megabox/location.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

beforeEach(() => {
  __testOnlyClearMegaboxLocationCaches();
});

describe('GET /api/megabox/theaters', () => {
  it('메가박스 주변 지점을 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ areaBrchList: [{ brchNo: '1372', brchNm: '강남' }] })),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>서울 강남구 강남대로</dd><a href="?lng=127.0&lat=37.5">지도</a>'),
      );

    const res = await app.request('/api/megabox/theaters?lat=37.5&lng=127.0');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.theaters)).toBe(true);
  });

  it('keyword로 지오코드한 위치를 기준으로 메가박스 지점을 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구',
                geometry: {
                  location: { lat: 37.3171, lng: 126.8389 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }] })),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>경기 안산시</dd><a href="?lng=126.8389&lat=37.3171">지도</a>'),
      );

    const res = await app.request('/api/megabox/theaters?keyword=안산%20중앙역', undefined, {
      GOOGLE_MAPS_API_KEY: 'test-google-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.areaCode).toBe('41');
    expect(data.data.theaters[0].theaterId).toBe('4431');
  });
});

describe('GET /api/megabox/movies', () => {
  it('메가박스 영화/회차 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          areaBrchList: [{ brchNo: '1372', brchNm: '강남' }],
          movieList: [{ movieNo: '25104500', movieNm: '영화A' }],
          movieFormList: [
            {
              playSchdlNo: 'S1',
              movieNo: '25104500',
              movieNm: '영화A',
              brchNo: '1372',
              brchNm: '강남',
              playStartTime: '0930',
              playEndTime: '1120',
              restSeatCnt: 10,
              totSeatCnt: 100,
            },
          ],
        }),
      ),
    );

    const res = await app.request('/api/megabox/movies?playDate=20260304');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.movies).toHaveLength(1);
    expect(data.data.showtimes).toHaveLength(1);
  });

  it('keyword만 있어도 가까운 극장을 자동 선택한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구',
                geometry: {
                  location: { lat: 37.3171, lng: 126.8389 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }] })),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>경기 안산시</dd><a href="?lng=126.8389&lat=37.3171">지도</a>'),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }],
            movieList: [{ movieNo: '25104500', movieNm: '영화A' }],
            movieFormList: [
              {
                playSchdlNo: 'S1',
                movieNo: '25104500',
                movieNm: '영화A',
                brchNo: '4431',
                brchNm: '안산중앙',
                playStartTime: '0930',
                playEndTime: '1120',
                restSeatCnt: 10,
                totSeatCnt: 100,
              },
            ],
          }),
        ),
      );

    const res = await app.request('/api/megabox/movies?playDate=20260315&keyword=안산%20중앙역', undefined, {
      GOOGLE_MAPS_API_KEY: 'test-google-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.filters.theaterId).toBe('4431');
    expect(data.data.filters.areaCode).toBe('41');
  });
});

describe('GET /api/megabox/seats', () => {
  it('메가박스 잔여 좌석 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          movieFormList: [
            {
              playSchdlNo: 'S1',
              movieNo: 'M1',
              movieNm: '영화A',
              brchNo: '1372',
              brchNm: '강남',
              playStartTime: '0930',
              playEndTime: '1120',
              restSeatCnt: 12,
              totSeatCnt: 100,
            },
          ],
        }),
      ),
    );

    const res = await app.request('/api/megabox/seats?playDate=20260304');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.seats).toHaveLength(1);
  });

  it('keyword만 있어도 가까운 극장 좌석을 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구',
                geometry: {
                  location: { lat: 37.3171, lng: 126.8389 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ areaBrchList: [{ brchNo: '4431', brchNm: '안산중앙' }] })),
      )
      .mockResolvedValueOnce(
        new Response('<dt>도로명주소</dt><dd>경기 안산시</dd><a href="?lng=126.8389&lat=37.3171">지도</a>'),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            movieFormList: [
              {
                playSchdlNo: 'S1',
                movieNo: 'M1',
                movieNm: '영화A',
                brchNo: '4431',
                brchNm: '안산중앙',
                playStartTime: '0930',
                playEndTime: '1120',
                restSeatCnt: 12,
                totSeatCnt: 100,
              },
            ],
          }),
        ),
      );

    const res = await app.request('/api/megabox/seats?playDate=20260315&keyword=안산%20중앙역', undefined, {
      GOOGLE_MAPS_API_KEY: 'test-google-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.filters.theaterId).toBe('4431');
    expect(data.data.filters.areaCode).toBe('41');
  });
});
