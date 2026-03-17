/**
 * 세븐일레븐 상품 검색어 보정 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSevenElevenProductKeywordVariants,
  pickBestSevenElevenProduct,
  searchSevenElevenProductsWithVariants,
} from '../../../src/services/seveneleven/productKeyword.js';
import type { SevenElevenProduct } from '../../../src/services/seveneleven/types.js';

const mockFetch = vi.fn();

function makeProductResponse(query: string, products: Array<Record<string, unknown>>) {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        SearchQueryResult: {
          query,
          Collection: [
            {
              CollectionId: 'offline',
              Documentset: {
                totalCount: products.length,
                Document: products,
              },
            },
          ],
        },
      },
    }),
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildSevenElevenProductKeywordVariants', () => {
  it('산도 계열 검색어에 대체 질의를 만든다', () => {
    expect(buildSevenElevenProductKeywordVariants('후르츠산도')).toEqual([
      '후르츠산도',
      '후르츠',
      '후르츠샌드위치',
      '후르츠샌드',
      '샌드',
    ]);
  });

  it('일반 검색어는 원본만 유지한다', () => {
    expect(buildSevenElevenProductKeywordVariants('핫식스')).toEqual(['핫식스']);
  });

  it('비어 있는 검색어는 빈 배열을 반환한다', () => {
    expect(buildSevenElevenProductKeywordVariants('   ')).toEqual([]);
  });
});

describe('pickBestSevenElevenProduct', () => {
  it('후르츠산도 요청에서 샌드 계열 상품을 우선 선택한다', () => {
    const products: SevenElevenProduct[] = [
      {
        productNo: '1',
        itemCode: '111',
        itemName: '농심)후르츠텔라48g',
        salePrice: 1500,
        originalPrice: 1500,
        imageUrl: '',
        eventName: '',
        itemType: '',
        makerName: '',
        reviewScore: null,
        reviewCount: 0,
      },
      {
        productNo: '2',
        itemCode: '222',
        itemName: '그린)샤빠딸후르츠샌드',
        salePrice: 3200,
        originalPrice: 3200,
        imageUrl: '',
        eventName: '',
        itemType: '',
        makerName: '',
        reviewScore: null,
        reviewCount: 0,
      },
    ];

    expect(pickBestSevenElevenProduct(products, '후르츠산도')?.itemCode).toBe('222');
  });

  it('유효한 상품명이 없으면 null을 반환한다', () => {
    const products: SevenElevenProduct[] = [
      {
        productNo: '',
        itemCode: '',
        itemName: '',
        salePrice: 0,
        originalPrice: 0,
        imageUrl: '',
        eventName: '',
        itemType: '',
        makerName: '',
        reviewScore: null,
        reviewCount: 0,
      },
    ];

    expect(pickBestSevenElevenProduct(products, '후르츠산도')).toBeNull();
  });

  it('itemCode가 없어도 이름이 맞으면 상품을 선택한다', () => {
    const products: SevenElevenProduct[] = [
      {
        productNo: 'fallback-no-code',
        itemCode: '',
        itemName: '그린)샤빠딸후르츠샌드',
        salePrice: 3700,
        originalPrice: 3700,
        imageUrl: '',
        eventName: '',
        itemType: '',
        makerName: '',
        reviewScore: null,
        reviewCount: 0,
      },
    ];

    expect(pickBestSevenElevenProduct(products, '후르츠산도')?.productNo).toBe('fallback-no-code');
  });
});

describe('searchSevenElevenProductsWithVariants', () => {
  it('대체 질의 결과를 합쳐 가장 관련도 높은 상품을 앞에 둔다', async () => {
    mockFetch
      .mockResolvedValueOnce(makeProductResponse('후르츠산도', []))
      .mockResolvedValueOnce(
        makeProductResponse('후르츠', [
          {
            prdNo: '1',
            itemCd: '111',
            itemOnm: '농심)후르츠텔라48g',
            onlinePrice: 1500,
          },
          {
            prdNo: '2',
            itemCd: '222',
            itemOnm: '그린)샤빠딸후르츠샌드',
            onlinePrice: 3200,
          },
        ]),
      )
      .mockResolvedValueOnce(makeProductResponse('후르츠샌드위치', []))
      .mockResolvedValueOnce(makeProductResponse('후르츠샌드', []))
      .mockResolvedValueOnce(makeProductResponse('샌드', []));

    const result = await searchSevenElevenProductsWithVariants('후르츠산도', {
      size: 10,
    });

    expect(result.totalCount).toBe(2);
    expect(result.products[0].itemCode).toBe('222');
    expect(result.appliedQueries).toEqual([
      '후르츠산도',
      '후르츠',
      '후르츠샌드위치',
      '후르츠샌드',
      '샌드',
    ]);
  });

  it('중복 상품과 빈 키 상품은 제외한다', async () => {
    mockFetch.mockResolvedValueOnce(
      makeProductResponse('핫식스', [
        {
          prdNo: '1',
          itemCd: '111',
          itemOnm: '핫식스',
          onlinePrice: 1500,
        },
        {
          prdNo: '2',
          itemCd: '111',
          itemOnm: '핫식스 중복',
          onlinePrice: 1500,
        },
        {
          prdNo: '',
          itemCd: '',
          itemOnm: '',
          onlinePrice: 0,
        },
      ]),
    );

    const result = await searchSevenElevenProductsWithVariants('핫식스', {
      size: 10,
    });

    expect(result.totalCount).toBe(1);
    expect(result.products[0].itemCode).toBe('111');
  });

  it('itemCode가 없으면 productNo와 itemName을 순서대로 fallback 키로 사용한다', async () => {
    mockFetch.mockResolvedValueOnce(
      makeProductResponse('핫식스', [
        {
          prdNo: 'fallback-product-no',
          itemCd: '',
          itemOnm: '핫식스',
          onlinePrice: 1500,
        },
        {
          prdNo: '',
          itemCd: '',
          itemOnm: '핫식스라벨',
          onlinePrice: 1200,
        },
      ]),
    );

    const result = await searchSevenElevenProductsWithVariants('핫식스', {
      size: 10,
    });

    expect(result.totalCount).toBe(2);
    expect(result.products[0].productNo).toBe('fallback-product-no');
    expect(result.products[1].itemName).toBe('핫식스라벨');
  });
});
