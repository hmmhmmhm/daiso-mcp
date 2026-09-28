import { clearSevenElevenReadCache } from '../../../src/services/seveneleven/readCache.js';
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

beforeEach(() => {
  clearSevenElevenReadCache();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seveneleven client retry defaults', () => {
  it('상품 검색 차단 시 유료 호출 없이 원본 HTTP 오류를 보존한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('blocked', { status: 403 }));
    await expect(
      searchSevenElevenProducts({ query: '커피' }, { zyteApiKey: 'worker-key' }),
    ).rejects.toThrow('API 요청 실패: 403');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(
      mockFetch.mock.calls.some(([url]) => new URL(String(url)).hostname === 'api.zyte.com'),
    ).toBe(false);
  });

  it('매장 검색 차단 시 유료 호출 없이 원본 HTTP 오류를 보존한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('blocked', { status: 403 }));
    await expect(
      fetchSevenElevenStoresByKeyword({ keyword: '강남' }, { zyteApiKey: 'worker-key' }),
    ).rejects.toThrow('API 요청 실패: 403');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(
      mockFetch.mock.calls.some(([url]) => new URL(String(url)).hostname === 'api.zyte.com'),
    ).toBe(false);
  });

  it('인기 검색어 차단 시 유료 호출 없이 원본 HTTP 오류를 보존한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('blocked', { status: 403 }));
    await expect(
      fetchSevenElevenSearchPopwords('home', { zyteApiKey: 'worker-key' }),
    ).rejects.toThrow('API 요청 실패: 403');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(
      mockFetch.mock.calls.some(([url]) => new URL(String(url)).hostname === 'api.zyte.com'),
    ).toBe(false);
  });

  it('재고 상품 메타 차단 시 유료 호출 없이 원본 HTTP 오류를 보존한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('blocked', { status: 403 }));
    await expect(
      fetchSevenElevenStockProductMeta('8801', { zyteApiKey: 'worker-key' }),
    ).rejects.toThrow('API 요청 실패: 403');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(
      mockFetch.mock.calls.some(([url]) => new URL(String(url)).hostname === 'api.zyte.com'),
    ).toBe(false);
  });

  it('카탈로그 페이지 차단 시 유료 호출 없이 빈 결과를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('blocked', { status: 403 }));
    await expect(
      fetchSevenElevenCatalogSnapshot({
        includeIssues: false,
        includeExhibition: false,
        zyteApiKey: 'worker-key',
      }),
    ).resolves.toEqual({ pages: [], issues: [], exhibitions: [] });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(
      mockFetch.mock.calls.some(([url]) => new URL(String(url)).hostname === 'api.zyte.com'),
    ).toBe(false);
  });

  it('일시적 GET 실패는 기본 재시도로 복구한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response('origin timeout', { status: 522, statusText: 'Origin Timeout' }),
      )
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
      .mockResolvedValueOnce(
        new Response('origin timeout', { status: 522, statusText: 'Origin Timeout' }),
      )
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
