/**
 * 롯데시네마 영화 목록 조회 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createListNowShowingTool } from '../../../../src/services/lottecinema/tools/listNowShowing.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createListNowShowingTool', () => {
  it('필터가 없으면 기본 목록을 반환한다', async () => {
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
          Movies: {
            Movies: {
              Items: [
                {
                  RepresentationMovieCode: '23816',
                  MovieNameKR: '왕과 사는 남자',
                },
              ],
            },
          },
        }),
      ),
    );

    const tool = createListNowShowingTool();
    const result = await tool.handler({ playDate: '20260310' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.filters.theaterId).toBeNull();
    expect(parsed.counts.movies).toBe(1);
    expect(parsed.counts.showtimes).toBe(0);
  });
});
