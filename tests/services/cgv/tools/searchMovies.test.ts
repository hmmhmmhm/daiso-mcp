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
  vi.restoreAllMocks();
});

describe('createSearchMoviesTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createSearchMoviesTool();

    expect(tool.name).toBe('cgv_search_movies');
    expect(tool.metadata.title).toBe('CGV 영화 검색');
  });

  it('영화 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            MovieList: [{ MovieCd: '200001', MovieName: '테스트 영화', Grade: '12' }],
          },
        }),
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
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ d: { MovieList: [] } })));

    const tool = createSearchMoviesTool();
    const result = await tool.handler({ playDate: '20260304' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterCode).toBeNull();
  });
});
