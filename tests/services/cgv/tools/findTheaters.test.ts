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
  vi.restoreAllMocks();
});

describe('createFindTheatersTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createFindTheatersTool();

    expect(tool.name).toBe('cgv_find_theaters');
    expect(tool.metadata.title).toBe('CGV 극장 검색');
  });

  it('극장 목록을 제한 개수로 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            TheaterList: [
              { TheaterCd: '0056', TheaterName: 'CGV강남', AreaCd: '01' },
              { TheaterCd: '0041', TheaterName: 'CGV용산아이파크몰', AreaCd: '01' },
            ],
          },
        }),
      ),
    );

    const tool = createFindTheatersTool();
    const result = await tool.handler({ playDate: '20260304', regionCode: '01', limit: 1 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.theaters[0].theaterCode).toBe('0056');
    expect(parsed.filters.regionCode).toBe('01');
  });
});
