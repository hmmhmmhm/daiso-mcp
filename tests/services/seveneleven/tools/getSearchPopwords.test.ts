/**
 * 세븐일레븐 인기 검색어 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGetSearchPopwordsTool } from '../../../../src/services/seveneleven/tools/getSearchPopwords.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createGetSearchPopwordsTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createGetSearchPopwordsTool();

    expect(tool.name).toBe('seveneleven_get_search_popwords');
    expect(tool.metadata.title).toBe('세븐일레븐 인기 검색어 조회');
  });

  it('인기 검색어를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            list: [{ keyword: '삼각김밥' }, { keyword: '도시락' }],
          },
        }),
      ),
    );

    const tool = createGetSearchPopwordsTool();
    const result = await tool.handler({ label: 'home' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.keywords).toEqual(['삼각김밥', '도시락']);
  });

  it('검색어가 없으면 안내 메시지를 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, data: {} })));

    const tool = createGetSearchPopwordsTool();
    const result = await tool.handler({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.note).toContain('찾지 못했습니다');
  });
});
