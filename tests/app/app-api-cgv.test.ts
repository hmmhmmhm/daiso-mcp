/**
 * 앱 통합 테스트 - CGV API
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';
import { __testOnlyClearCgvLocationCaches } from '../../src/services/cgv/location.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

beforeEach(() => {
  __testOnlyClearCgvLocationCaches();
});

describe('GET /api/cgv/theaters', () => {
  it('CGV 극장 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const res = await app.request('/api/cgv/theaters?playDate=20260304&regionCode=01');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.theaters).toHaveLength(1);
  });

  it('keyword로 가까운 CGV 극장을 찾는다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [{ siteNo: '0211', siteNm: '안산' }],
              },
            ],
          }),
        ),
      )
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
      );

    const res = await app.request('/api/cgv/theaters?playDate=20260315&keyword=안산%20중앙역', undefined, {
      GOOGLE_MAPS_API_KEY: 'test-google-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.theaters[0].theaterCode).toBe('0211');
  });
});

describe('GET /api/cgv/movies', () => {
  it('CGV 영화 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [{ movNo: '30000985', movNm: '영화A', cratgClsNm: '12세' }],
        }),
      ),
    );

    const res = await app.request('/api/cgv/movies?playDate=20260304&theaterCode=0056');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.movies).toHaveLength(1);
  });

  it('keyword만으로 가까운 극장의 영화 목록을 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [{ siteNo: '0211', siteNm: '안산' }],
              },
            ],
          }),
        ),
      )
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
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [{ movNo: '30000985', movNm: '영화A', cratgClsNm: '12세' }],
          }),
        ),
      );

    const res = await app.request('/api/cgv/movies?playDate=20260315&keyword=안산%20중앙역', undefined, {
      GOOGLE_MAPS_API_KEY: 'test-google-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.filters.theaterCode).toBe('0211');
  });
});

describe('GET /api/cgv/timetable', () => {
  it('CGV 시간표를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              siteNo: '0056',
              siteNm: 'CGV강남',
              scnYmd: '20260304',
              scnSseq: '1',
              movNo: 'M1',
              movNm: '영화A',
              scnsrtTm: '0930',
              scnendTm: '1130',
              stcnt: 100,
              frSeatCnt: 30,
            },
          ],
        }),
      ),
    );

    const res = await app.request('/api/cgv/timetable?playDate=20260304&theaterCode=0056');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.timetable).toHaveLength(1);
  });

  it('keyword만으로 가까운 극장의 시간표를 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [{ siteNo: '0211', siteNm: '안산' }],
              },
            ],
          }),
        ),
      )
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
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                siteNo: '0211',
                siteNm: 'CGV안산',
                scnYmd: '20260315',
                scnSseq: '1',
                movNo: 'M1',
                movNm: '영화A',
                scnsrtTm: '0930',
                scnendTm: '1130',
                stcnt: 100,
                frSeatCnt: 30,
              },
            ],
          }),
        ),
      );

    const res = await app.request('/api/cgv/timetable?playDate=20260315&keyword=안산%20중앙역', undefined, {
      GOOGLE_MAPS_API_KEY: 'test-google-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.filters.theaterCode).toBe('0211');
  });
});
