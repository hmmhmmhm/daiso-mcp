/**
 * 이마트24 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateDistanceM,
  fetchEmart24StoreDetail,
  fetchEmart24Stores,
  searchEmart24Products,
  searchEmart24StockByStores,
} from '../../../src/services/emart24/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchEmart24Stores', () => {
  it('일시적 GET 실패는 기본 재시도로 복구한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('origin timeout', { status: 522, statusText: 'Origin Timeout' }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 0,
            count: 1,
            data: [{ CODE: '28339', TITLE: '강남스퀘어점' }],
          }),
        ),
      );

    const result = await fetchEmart24Stores({ keyword: '강남' });

    expect(result.stores[0].storeCode).toBe('28339');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('매장 목록을 정규화해서 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 0,
          count: 1,
          data: [
            {
              CODE: '28339',
              TITLE: '강남스퀘어점',
              ADDRESS: '서울특별시 강남구 강남대로 396',
              LATITUDE: '37.4982',
              LONGITUDE: '127.0276',
              SVR_24: '1',
            },
          ],
        }),
      ),
    );

    const result = await fetchEmart24Stores({ keyword: '강남' });

    expect(result.totalCount).toBe(1);
    expect(result.appliedKeyword).toBe('강남');
    expect(result.stores[0]).toEqual(
      expect.objectContaining({
        storeCode: '28339',
        storeName: '강남스퀘어점',
        latitude: 37.4982,
        longitude: 127.0276,
        service24h: true,
      }),
    );
  });

  it('error 값이 있으면 예외를 던진다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 1, count: 0, data: [] })));

    await expect(fetchEmart24Stores({ keyword: '강남' })).rejects.toThrow(
      '이마트24 매장 조회 실패: error=1',
    );
  });

  it('error=1이면 키워드 변형으로 재시도한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 1, count: 0, data: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 0,
            count: 1,
            data: [{ CODE: '05015', TITLE: 'R안산중앙점', LATITUDE: 37.3, LONGITUDE: 126.8 }],
          }),
        ),
      );

    const result = await fetchEmart24Stores({ keyword: '안산 중앙역' });
    const firstUrl = String(mockFetch.mock.calls[0][0]);
    const secondUrl = String(mockFetch.mock.calls[1][0]);

    expect(result.totalCount).toBe(1);
    expect(result.appliedKeyword).toBe('안산중앙역');
    expect(result.stores[0].storeCode).toBe('05015');
    expect(firstUrl).toContain('search=%EC%95%88%EC%82%B0+%EC%A4%91%EC%95%99%EC%97%AD');
    expect(secondUrl).toContain('search=%EC%95%88%EC%82%B0%EC%A4%91%EC%95%99%EC%97%AD');
  });

  it('error=1 재시도 후에도 실패하면 예외를 던진다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 1, count: 0, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 1, count: 0, data: [] })));

    await expect(fetchEmart24Stores({ keyword: '중앙역' })).rejects.toThrow(
      '이마트24 매장 조회 실패: error=1',
    );
  });

  it('error=1이 아닌 경우 재시도하지 않고 실패한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 9, count: 0, data: [] })));

    await expect(fetchEmart24Stores({ keyword: '강남' })).rejects.toThrow(
      '이마트24 매장 조회 실패: error=9',
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('area/service 필터 파라미터를 요청 URL에 반영한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 0, count: 0, data: [] })));

    await fetchEmart24Stores({
      keyword: '강남',
      area1: '서울특별시',
      area2: '강남구',
      service24h: true,
      page: 2,
    });

    const calledUrl = String(mockFetch.mock.calls[0][0]);
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('search=%EA%B0%95%EB%82%A8');
    expect(calledUrl).toContain('AREA1=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C');
    expect(calledUrl).toContain('AREA2=%EA%B0%95%EB%82%A8%EA%B5%AC');
    expect(calledUrl).toContain('SVR_24=1');
  });

  it('SVR_24가 boolean이어도 24시간 여부를 해석한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 0,
          count: 1,
          data: [{ CODE: '1', TITLE: '테스트점', SVR_24: true }],
        }),
      ),
    );

    const result = await fetchEmart24Stores({});
    expect(result.stores[0].service24h).toBe(true);
  });
});

describe('searchEmart24Products', () => {
  it('POST 상품 검색은 기본 재시도하지 않는다', async () => {
    mockFetch.mockResolvedValueOnce(new Response('origin timeout', { status: 522, statusText: 'Origin Timeout' }));

    await expect(searchEmart24Products({ keyword: '두바이' })).rejects.toThrow('API 요청 실패: 522');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('상품 검색 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          productList: [
            {
              pluCd: '8800244010504',
              goodsNm: '두바이초콜릿',
              originPrice: 3500,
              viewPrice: 3000,
            },
          ],
        }),
      ),
    );

    const result = await searchEmart24Products({ keyword: '두바이' });

    expect(result.totalCount).toBe(1);
    expect(result.products[0].pluCd).toBe('8800244010504');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://everse.emart24.co.kr/stock/stock/search',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('PLU 코드가 비어 있는 항목은 제외한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCnt: 2,
          productList: [
            { pluCd: '', goodsNm: '제외대상' },
            { pluCd: '8801', goodsNm: '포함대상' },
          ],
        }),
      ),
    );

    const result = await searchEmart24Products({ keyword: '테스트' });
    expect(result.products).toHaveLength(1);
    expect(result.products[0].pluCd).toBe('8801');
  });
});

describe('정규화 보조 분기', () => {
  it('매장 데이터가 없으면 빈 배열을 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 0, count: 0 })));
    const result = await fetchEmart24Stores({});
    expect(result.stores).toEqual([]);
  });

  it('숫자/문자 fallback을 0으로 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 0,
          count: 1,
          data: [
            {
              CODE: '',
              TITLE: '',
              LATITUDE: 'abc',
              LONGITUDE: Infinity,
              SVR_24: 'N',
            },
          ],
        }),
      ),
    );

    const result = await fetchEmart24Stores({});
    expect(result.stores).toEqual([]);
  });
});

describe('searchEmart24StockByStores', () => {
  it('매장 코드가 비어 있으면 빈 결과를 반환한다', async () => {
    const result = await searchEmart24StockByStores({
      pluCd: '8800244010504',
      bizNos: ['  '],
    });

    expect(result.storeGoodsQty).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('매장별 재고 조회 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          storeGoodsInfo: { pluCd: '8800244010504', goodsNm: '두바이초콜릿' },
          storeGoodsQty: [{ BIZNO: '28339', BIZQTY: '3' }],
        }),
      ),
    );

    const result = await searchEmart24StockByStores({
      pluCd: '8800244010504',
      bizNos: ['28339'],
    });

    expect(result.storeGoodsQty).toHaveLength(1);
    expect(result.storeGoodsQty?.[0].BIZNO).toBe('28339');
  });
});

describe('fetchEmart24StoreDetail', () => {
  it('매장 상세를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          storeInfo: {
            storeNm: '강남스퀘어점',
            tel: '02-000-0000',
            storeAddr: '서울특별시 강남구 강남대로 396',
          },
        }),
      ),
    );

    const result = await fetchEmart24StoreDetail('28339');

    expect(result.storeInfo?.storeNm).toBe('강남스퀘어점');
  });
});

describe('calculateDistanceM', () => {
  it('동일 좌표는 0m를 반환한다', () => {
    expect(calculateDistanceM(37.5, 127.0, 37.5, 127.0)).toBe(0);
  });
});
