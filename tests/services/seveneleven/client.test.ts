/**
 * 세븐일레븐 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSevenElevenCatalogSnapshot,
  fetchSevenElevenSearchPopwords,
  fetchSevenElevenStockProductMeta,
  fetchSevenElevenStoresByKeyword,
  searchSevenElevenProducts,
} from '../../../src/services/seveneleven/client.js';

const mockFetch = vi.fn();

function zyteJsonResponse(value: unknown): Response {
  return new Response(
    JSON.stringify({
      statusCode: 200,
      httpResponseBody: Buffer.from(JSON.stringify(value), 'utf8').toString('base64'),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seveneleven client retry defaults', () => {
  it('상품 검색 403을 Zyte로 복구한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        zyteJsonResponse({
          success: true,
          data: {
            SearchQueryResult: {
              query: '커피',
              Collection: [
                {
                  CollectionId: 'offline',
                  Documentset: {
                    totalCount: 1,
                    Document: [{ field: { itemCd: '8801', itemOnm: '커피' } }],
                  },
                },
              ],
            },
          },
          message: '성공',
          code: 200,
        }),
      );

    const result = await searchSevenElevenProducts(
      { query: '커피', size: 1 },
      { zyteApiKey: 'worker-key' },
    );

    expect(result.products[0].itemCode).toBe('8801');
    const payload = JSON.parse(String(mockFetch.mock.calls[1][1]?.body));
    expect(payload).toMatchObject({
      url: 'https://new.7-elevenapp.co.kr/api/v1/open/search/goods',
      httpRequestMethod: 'POST',
      tags: { service: 'seveneleven' },
    });
  });

  it('매장 검색 403을 Zyte로 복구한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        zyteJsonResponse({
          success: true,
          data: {
            SearchQueryResult: {
              query: '강남',
              Collection: [
                {
                  Documentset: {
                    totalCount: 1,
                    Document: [{ field: { storeCd: 'S1', storeNm: '강남점' } }],
                  },
                },
              ],
            },
          },
        }),
      );

    const result = await fetchSevenElevenStoresByKeyword(
      { keyword: '강남', limit: 1 },
      { zyteApiKey: 'worker-key' },
    );

    expect(result.stores[0].storeCode).toBe('S1');
  });

  it('인기 검색어 403을 Zyte로 복구한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        zyteJsonResponse({
          success: true,
          data: { keywords: ['커피', '도시락'] },
        }),
      );

    await expect(
      fetchSevenElevenSearchPopwords('home', { zyteApiKey: 'worker-key' }),
    ).resolves.toEqual(['커피', '도시락']);
  });

  it('재고 상품 메타 403을 Zyte로 복구한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        zyteJsonResponse({
          prdNo: 'P1',
          itemCd: '8801',
          itemOnm: '커피',
          smCd: 'SM1',
          stokMngCd: 'STOCK',
          stokMngQty: 3,
          stockApplicationRate: '100',
        }),
      );

    const result = await fetchSevenElevenStockProductMeta('8801', {
      zyteApiKey: 'worker-key',
    });

    expect(result).toEqual(expect.objectContaining({ itemCode: '8801', smCode: 'SM1' }));
  });

  it('카탈로그 페이지 403을 Zyte로 복구한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
      .mockResolvedValueOnce(
        zyteJsonResponse({
          success: true,
          data: {
            content: [{ itemCd: '8801', itemOnm: '커피' }],
          },
        }),
      );

    const result = await fetchSevenElevenCatalogSnapshot({
      includeIssues: false,
      includeExhibition: false,
      zyteApiKey: 'worker-key',
    });

    expect(result.pages[0].itemCode).toBe('8801');
  });

  it('일시적 GET 실패는 기본 재시도로 복구한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('origin timeout', { status: 522, statusText: 'Origin Timeout' }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            itemCd: '8801',
            smCd: 'SM1',
            itemOnm: '커피',
            stokMngCd: 'STOCK',
            stokMngQty: 3,
          }),
        ),
      );

    const result = await fetchSevenElevenStockProductMeta('8801');

    expect(result).toEqual(expect.objectContaining({ itemCode: '8801', smCode: 'SM1' }));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('읽기성 POST 상품 검색은 allowlist로 재시도한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('origin timeout', { status: 522, statusText: 'Origin Timeout' }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              SearchQueryResult: {
                Collection: [
                  {
                    Documentset: {
                      totalCount: 1,
                      Document: [{ field: { itemCd: '8801', itemOnm: '커피' } }],
                    },
                  },
                ],
              },
            },
          }),
        ),
      );

    const result = await searchSevenElevenProducts({ query: '커피' });

    expect(result.products[0].itemCode).toBe('8801');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
