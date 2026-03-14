/**
 * 세븐일레븐 재고 확인 도구 매장 필터링 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckInventoryTool } from '../../../../src/services/seveneleven/tools/checkInventory.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeProductResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        SearchQueryResult: {
          query: '핫식스',
          Collection: [
            {
              CollectionId: 'offline',
              Documentset: {
                totalCount: 1,
                Document: [
                  {
                    prdNo: '100',
                    itemCd: '8801234567890',
                    itemOnm: '핫식스 250ml',
                    onlinePrice: 1500,
                    onlineCost: 1500,
                    repImgUrl: 'https://img.7-eleven.co.kr/hot6.jpg',
                  },
                ],
              },
            },
          ],
        },
      },
    }),
  );
}

function makeStoreResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        SearchQueryResult: {
          query: '안산중앙',
          Collection: [
            {
              CollectionId: 'store',
              Documentset: {
                totalCount: 2,
                Document: [
                  {
                    field: {
                      storeCd: '54928',
                      storeNm: '안산중앙일번가점',
                      addr1: '경기 안산시 단원구 중앙대로 100',
                      addr2: '',
                      storeLat: '37.3156',
                      storeLon: '126.8384',
                    },
                  },
                  {
                    field: {
                      storeCd: '57766',
                      storeNm: '안산대부펜션시티점',
                      addr1: '경기 안산시 단원구 대부중앙로 150',
                      addr2: '',
                      storeLat: '37.2407',
                      storeLon: '126.5897',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    }),
  );
}

describe('createCheckInventoryTool store filtering', () => {
  it('역 기반 검색어를 정규화하고 원거리 오탐 매장을 제거한다', async () => {
    mockFetch
      .mockResolvedValueOnce(makeProductResponse())
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            prdNo: '100',
            itemCd: '8801234567890',
            itemOnm: '핫식스 250ml',
            smCd: '201051',
            stokMngCd: '201051',
            stokMngQty: 1,
            stockApplicationRate: '100',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              smCd: '201051',
              storeList: [{ storeCd: '54928', stock: 5, stokMngQty: 0 }],
            },
            message: '성공',
            code: 200,
          }),
        ),
      );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '핫식스', storeKeyword: '안산 중앙역' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.stockAvailable).toBe(true);
    expect(parsed.inventory.totalStoreCount).toBe(1);
    expect(parsed.inventory.stores[0].storeCode).toBe('54928');
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://new.7-elevenapp.co.kr/api/v1/open/search/store',
      expect.objectContaining({
        body: JSON.stringify({
          collection: 'store',
          query: '안산중앙',
          sort: 'Date/desc',
          listCount: 100,
        }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      'https://new.7-elevenapp.co.kr/api/v1/open/real-stock/multi/01/stocks',
      expect.objectContaining({
        body: JSON.stringify({
          smCd: '201051',
          stokMngCd: '201051',
          stokMngQty: 1,
          stockApplicationRate: '100',
          storeList: ['54928'],
        }),
      }),
    );
  });
});
