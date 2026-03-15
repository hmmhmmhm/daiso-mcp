/**
 * CGV 영화 검색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchMoviesTool } from '../../../../src/services/cgv/tools/searchMovies.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  vi.restoreAllMocks();
});

describe('createSearchMoviesTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createSearchMoviesTool();

    expect(tool.name).toBe('cgv_search_movies');
    expect(tool.metadata.title).toBe('CGV 영화 검색');
  });

  it('영화 목록을 반환한다', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [{ movNo: '30000985', movNm: '테스트 영화', cratgClsNm: '전체관람가' }],
          }),
        ),
      ),
    );

    const tool = createSearchMoviesTool();
    const result = await tool.handler({ playDate: '20260304', theaterCode: '0056' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.movies[0].movieName).toBe('테스트 영화');
    expect(parsed.filters.theaterCode).toBe('0056');
  });

  it('필터가 없으면 null로 반환한다', async () => {
    mockFetch
      .mockImplementationOnce(() =>
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
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ statusCode: 0, statusMessage: '조회 되었습니다.', data: [] }),
          ),
        ),
      );

    const tool = createSearchMoviesTool();
    const result = await tool.handler({ playDate: '20260304' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterCode).toBeNull();
  });

  it('keyword만 있어도 가까운 극장을 골라 영화 목록을 조회한다', async () => {
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
            data: [{ movNo: '30000985', movNm: '테스트 영화' }],
          }),
        ),
      );

    const tool = createSearchMoviesTool(undefined, 'test-google-key');
    const result = await tool.handler({ playDate: '20260315', keyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterCode).toBe('0211');
    expect(parsed.resolvedTheater.theaterCode).toBe('0211');
    expect(parsed.movies[0].movieCode).toBe('30000985');
  });

  it('keyword 기준 극장을 못 찾으면 빈 결과를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
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

    const tool = createSearchMoviesTool();
    const result = await tool.handler({ playDate: '20260315', keyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterCode).toBeNull();
    expect(parsed.resolvedTheater).toBeNull();
    expect(parsed.movies).toEqual([]);
  });
});
