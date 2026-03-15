/**
 * CGV 극장 검색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFindTheatersTool } from '../../../../src/services/cgv/tools/findTheaters.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  vi.restoreAllMocks();
});

describe('createFindTheatersTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createFindTheatersTool();

    expect(tool.name).toBe('cgv_find_theaters');
    expect(tool.metadata.title).toBe('CGV 극장 검색');
  });

  it('극장 목록을 제한 개수로 반환한다', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '01',
                regnGrpNm: '서울',
                siteList: [
                  { siteNo: '0056', siteNm: '강남' },
                  { siteNo: '0001', siteNm: '강변' },
                ],
              },
            ],
          }),
        ),
      ),
    );

    const tool = createFindTheatersTool();
    const result = await tool.handler({ playDate: '20260304', regionCode: '01', limit: 1 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.theaters[0].theaterCode).toBe('0056');
    expect(parsed.filters.regionCode).toBe('01');
  });

  it('regionCode가 없으면 null로 반환한다', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
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
      ),
    );

    const tool = createFindTheatersTool();
    const result = await tool.handler({ playDate: '20260304' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.regionCode).toBeNull();
  });

  it('keyword가 있으면 가까운 극장 후보를 우선 반환한다', async () => {
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

    const tool = createFindTheatersTool(undefined, 'test-google-key');
    const result = await tool.handler({ playDate: '20260315', keyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.theaters[0].theaterCode).toBe('0211');
    expect(parsed.keyword).toBe('안산 중앙역');
  });

  it('환경 변수 구글 키도 사용한다', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
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

    const tool = createFindTheatersTool();
    const result = await tool.handler({ playDate: '20260315', keyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.theaters[0].theaterCode).toBe('0211');
  });
});
