/**
 * 세븐일레븐 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSevenElevenStockProductMeta,
  searchSevenElevenProducts,
} from '../../../src/services/seveneleven/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seveneleven client retry defaults', () => {
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

  it('POST 상품 검색은 기본 재시도하지 않는다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('origin timeout', { status: 522, statusText: 'Origin Timeout' }));

    await expect(searchSevenElevenProducts({ query: '커피' })).rejects.toThrow('API 요청 실패: 522');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
