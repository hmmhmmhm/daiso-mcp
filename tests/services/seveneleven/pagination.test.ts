/** 세븐일레븐 전체 결과의 중복 제거와 페이지 경계를 검증합니다. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { searchSevenElevenProducts } from '../../../src/services/seveneleven/client.js';
import { searchSevenElevenProductsWithVariants } from '../../../src/services/seveneleven/productKeyword.js';
import { clearSevenElevenReadCache } from '../../../src/services/seveneleven/readCache.js';
const mockFetch = vi.fn();
const product = (id: number) => ({ field: { itemCd: String(id), itemOnm: `커피 ${id}` } });
function response(ids: number[], duplicate = false, total = ids.length) {
  return new Response(
    JSON.stringify({
      data: {
        SearchQueryResult: {
          Collection: [
            {
              CollectionId: 'pickup',
              Documentset: { totalCount: total, Document: ids.map(product) },
            },
            ...(duplicate
              ? [
                  {
                    CollectionId: 'offline',
                    Documentset: { totalCount: ids.length, Document: ids.map(product) },
                  },
                ]
              : []),
          ],
        },
      },
    }),
  );
}
beforeEach(() => {
  clearSevenElevenReadCache();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => vi.restoreAllMocks());
it('공식 요청으로 전체 상품을 받아 중복 없는 세 페이지와 마지막 빈 페이지를 반환한다', async () => {
  mockFetch.mockImplementation(async () => response([1, 2, 3, 4, 5, 6, 7], true));
  const results = [];
  for (const page of [1, 2, 3, 4])
    results.push(await searchSevenElevenProducts({ query: '커피', page, size: 3 }));
  expect(results.map((r) => r.products.map((p) => p.itemCode))).toEqual([
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7'],
    [],
  ]);
  expect(results.map((r) => r.totalCount)).toEqual([7, 7, 7, 7]);
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
    collection: 'goods',
    query: '커피',
    sort: 'quantity/desc,itemOnm/asc',
    startCount: 0,
    listCount: 100,
  });
});
it('보정 질의 전체를 합쳐 중복 제거 후 한 번만 페이지를 자른다', async () => {
  mockFetch.mockImplementation(async (_url, init) =>
    JSON.parse(init.body).query === '커 피' ? response([1, 2, 3, 4]) : response([3, 4, 5, 6]),
  );
  const pages = [];
  for (const page of [1, 2, 3])
    pages.push(await searchSevenElevenProductsWithVariants('커 피', { page, size: 2 }));
  expect(pages.map((r) => r.products.map((p) => p.itemCode))).toEqual([
    ['1', '2'],
    ['3', '4'],
    ['5', '6'],
  ]);
  expect(pages.map((r) => r.totalCount)).toEqual([6, 6, 6]);
});
it('전체 요청이 잘리면 일부 결과를 전체로 보고하지 않는다', async () => {
  mockFetch.mockImplementation(async () => response([1, 2], false, 5));
  await expect(searchSevenElevenProducts({ query: '커피' })).rejects.toThrow(
    '전체 상품 검색 결과가 잘렸습니다',
  );
});

it('100개씩 제한된 원본 페이지를 수집한 뒤 전역 페이지를 계산한다', async () => {
  mockFetch.mockImplementation(async (_url, init) => {
    const page = JSON.parse(init.body).startCount;
    return response(
      page === 0 ? Array.from({ length: 100 }, (_, i) => i + 1) : [101, 102],
      false,
      102,
    );
  });
  const result = await searchSevenElevenProducts({ query: '커피', page: 34, size: 3 });
  expect(result.totalCount).toBe(102);
  expect(result.products.map((p) => p.itemCode)).toEqual(['100', '101', '102']);
  expect(mockFetch.mock.calls.map((c) => JSON.parse(c[1].body).startCount)).toEqual([0, 1]);
});

it('500개 한도를 넘는 검색은 정상 결과로 표시하지 않는다', async () => {
  mockFetch.mockImplementation(async () => response([1], false, 501));
  await expect(searchSevenElevenProducts({ query: '커피' })).rejects.toThrow('최대 500개 제한');
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it('보정 질의들이 원본 호출 예산 10회를 공유한다', async () => {
  mockFetch.mockImplementation(async (_url, init) => {
    const page = JSON.parse(init.body).startCount;
    return response(
      Array.from({ length: 100 }, (_, i) => page * 100 + i + 1),
      false,
      400,
    );
  });
  await expect(searchSevenElevenProductsWithVariants('후르츠산도')).rejects.toThrow(
    '최대 10회 검색 제한',
  );
  expect(mockFetch).toHaveBeenCalledTimes(10);
});

function collectionsResponse(collections: Array<[string, number, number[]]>) {
  return new Response(
    JSON.stringify({
      data: {
        SearchQueryResult: {
          Collection: collections.map(([id, total, ids]) => ({
            CollectionId: id,
            Documentset: { totalCount: total, Document: ids.map(product) },
          })),
        },
      },
    }),
  );
}
it.each([
  [
    '미완료 컬렉션 누락',
    [
      ['A', 3, [1]],
      ['B', 2, [2, 3]],
    ],
    [['B', 2, [4]]],
  ],
  ['컬렉션 합계 변경', [['A', 3, [1]]], [['A', 1, [2]]]],
  [
    '다른 컬렉션이 진행해도 반복 상품 거절',
    [
      ['A', 2, [1]],
      ['B', 2, [3]],
    ],
    [
      ['A', 2, [1]],
      ['B', 2, [4]],
    ],
  ],
] as Array<[string, Array<[string, number, number[]]>, Array<[string, number, number[]]>]>)(
  '%s를 불완전한 결과로 거절한다',
  async (_name, first, second) => {
    mockFetch
      .mockResolvedValueOnce(collectionsResponse(first))
      .mockResolvedValueOnce(collectionsResponse(second));
    await expect(searchSevenElevenProducts({ query: '커피' })).rejects.toThrow(
      '전체 상품 검색 결과가 잘렸습니다',
    );
  },
);
it('완료된 컬렉션은 다음 원본 페이지에서 생략되어도 보존한다', async () => {
  mockFetch
    .mockResolvedValueOnce(
      collectionsResponse([
        ['A', 2, [1]],
        ['B', 1, [3]],
      ]),
    )
    .mockResolvedValueOnce(collectionsResponse([['A', 2, [2]]]));
  const result = await searchSevenElevenProducts({ query: '커피' });
  expect(result.products.map((p) => p.itemCode)).toEqual(['1', '3', '2']);
  expect(result.collectionIds).toEqual(['A', 'B']);
  expect(result.totalCount).toBe(3);
});
it('명시적 컬렉션이나 content 목록이 없는 응답은 거절한다', async () => {
  mockFetch.mockResolvedValueOnce(Response.json({ data: {} }));
  await expect(searchSevenElevenProducts({ query: '커피' })).rejects.toThrow(
    '전체 상품 검색 결과가 잘렸습니다',
  );
});
it('명시적 레거시 content 목록은 완전한 결과로 페이지 분할한다', async () => {
  mockFetch.mockResolvedValueOnce(
    Response.json({
      data: {
        content: [
          { itemCd: '1', itemOnm: '커피' },
          { itemCd: '2', itemOnm: '커피' },
        ],
      },
    }),
  );
  const result = await searchSevenElevenProducts({ query: '커피', page: 2, size: 1 });
  expect(result.totalCount).toBe(2);
  expect(result.products.map((p) => p.itemCode)).toEqual(['2']);
});

it('공식 페이지 도중 레거시 목록으로 바뀌면 불완전한 결과를 거절한다', async () => {
  mockFetch
    .mockResolvedValueOnce(collectionsResponse([['A', 3, [1]]]))
    .mockResolvedValueOnce(
      Response.json({ data: { content: [{ itemCd: '2', itemOnm: '커피' }] } }),
    );
  await expect(searchSevenElevenProducts({ query: '커피' })).rejects.toThrow(
    '전체 상품 검색 결과가 잘렸습니다',
  );
});
it('초기 레거시 목록도 전체 500개 제한을 적용한다', async () => {
  mockFetch.mockResolvedValueOnce(
    Response.json({
      data: {
        content: Array.from({ length: 501 }, (_, i) => ({ itemCd: String(i), itemOnm: '커피' })),
      },
    }),
  );
  await expect(searchSevenElevenProducts({ query: '커피' })).rejects.toThrow('최대 500개 제한');
});

it('교환권 컬렉션의 같은 상품 코드가 먼저 확인한 매장 상품 번호를 덮어쓰지 않는다', async () => {
  mockFetch.mockResolvedValueOnce(Response.json({
    data: { SearchQueryResult: { Collection: [
      { CollectionId: 'pickup', Documentset: { totalCount: 1, Document: [
        { field: { itemCd: '8809415436006', prdNo: '3047966', itemOnm: '커피', itemGbnNm: '당일픽업', onlinePrice: '2000' } },
      ] } },
      { CollectionId: 'coupon', Documentset: { totalCount: 1, Document: [
        { field: { itemCd: '8809415436006', prdNo: '21441', itemOnm: '커피', itemGbnNm: '교환권', onlinePrice: '2000' } },
      ] } },
    ] } },
  }));
  const result = await searchSevenElevenProducts({ query: '커피' });
  expect(result.totalCount).toBe(1);
  expect(result.products[0]).toMatchObject({ productNo: '3047966', itemType: '당일픽업', salePrice: 2000 });
});
