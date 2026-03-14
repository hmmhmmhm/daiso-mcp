/**
 * 세븐일레븐 매장 검색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchStoresTool } from '../../../../src/services/seveneleven/tools/searchStores.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSearchStoresTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createSearchStoresTool();

    expect(tool.name).toBe('seveneleven_search_stores');
    expect(tool.metadata.title).toBe('세븐일레븐 매장 검색');
  });

  it('keyword가 없으면 에러를 던진다', async () => {
    const tool = createSearchStoresTool();

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('매장 검색어(keyword)를 입력해주세요.');
  });

  it('매장 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            SearchQueryResult: {
              query: '안산 중앙역',
              Collection: [
                {
                  CollectionId: 'store',
                  Documentset: {
                    totalCount: 1,
                    Document: [
                      {
                        field: {
                          storCd: '54928',
                          storNm: '안산중앙일번가점',
                          addr: '경기 안산시 단원구 ...',
                          yPos: '37.3156',
                          xPos: '126.8384',
                          pickupYn: 'Y',
                          dlvyYn: 'N',
                          closeYn: 'N',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
      ),
    );

    const tool = createSearchStoresTool();
    const result = await tool.handler({ keyword: '안산 중앙역', limit: 10 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalCount).toBe(1);
    expect(parsed.count).toBe(1);
    expect(parsed.stores[0].storeCode).toBe('54928');
    expect(parsed.stores[0].pickupEnabled).toBe(true);
    expect(parsed.stores[0].deliveryEnabled).toBe(false);
  });
});
