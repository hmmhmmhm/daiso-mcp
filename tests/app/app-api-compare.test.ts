/**
 * 앱 통합 테스트 - 통합 가격 비교 API
 */
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

function mockCompareFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);

  if (url.includes('FindStoreGoods')) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          resultSet: {
            result: [
              {
                totalSize: 1,
                resultDocuments: [
                  { PD_NO: 'd1', PDNM: '콜라 500ml', PD_PRC: '1500', ATCH_FILE_URL: '/cola.jpg' },
                ],
              },
            ],
          },
        }),
      ),
    );
  }

  if (url.includes('totalSearch')) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          SearchQueryResult: {
            Collection: [
              {
                Documentset: {
                  Document: [
                    {
                      field: {
                        itemCode: 'g1',
                        itemName: 'GS25 콜라',
                        itemImageUrl: 'https://example.com/gs25.jpg',
                        stockCheckYn: 'Y',
                      },
                    },
                  ],
                },
              },
            ],
          },
        }),
      ),
    );
  }

  if (url.includes('7-elevenapp')) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: {
            SearchQueryResult: {
              query: '콜라',
              Collection: [
                {
                  CollectionId: 'goods',
                  Documentset: {
                    totalCount: 1,
                    Document: [
                      {
                        field: {
                          itemCd: 's1',
                          itemOnm: '세븐 콜라',
                          onlinePrice: 1400,
                          repImgUrl: 'https://example.com/seven.jpg',
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
  }

  if (url.includes('everse.emart24.co.kr')) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          totalCnt: 1,
          productList: [
            {
              pluCd: 'e1',
              goodsNm: '이마트24 콜라',
              originPrice: 1600,
              viewPrice: 1300,
            },
          ],
        }),
      ),
    );
  }

  return Promise.reject(new Error(`Unexpected fetch: ${url}`));
}

describe('GET /api/compare/products', () => {
  it('키워드로 여러 키 없는 상품 검색을 묶어 가격 후보를 비교한다', async () => {
    mockFetch.mockImplementation(mockCompareFetch);

    const res = await app.request('/api/compare/products?keyword=%EC%BD%9C%EB%9D%BC&limit=2');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.keyword).toBe('콜라');
    expect(data.data.serviceCount).toBe(4);
    expect(data.data.results.map((item: { service: string }) => item.service)).toEqual([
      'emart24',
      'seveneleven',
      'daiso',
      'gs25',
    ]);
    expect(data.data.bestPrice.price).toBe(1300);
    expect(data.data.errors).toEqual([]);
  });

  it('키워드가 없으면 오류를 반환한다', async () => {
    const res = await app.request('/api/compare/products');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_KEYWORD');
  });
});
