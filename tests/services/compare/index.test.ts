/**
 * 통합 비교 서비스 프로바이더 테스트
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompareService } from '../../../src/services/compare/index.js';
import { compareProducts, parseCompareServices } from '../../../src/services/compare/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createCompareService', () => {
  it('통합 가격 비교 MCP 도구를 등록한다', () => {
    const service = createCompareService();

    expect(service.metadata.id).toBe('compare');
    expect(service.getTools().map((tool) => tool.name)).toEqual(['compare_products']);
  });

  it('services 문자열을 지원 서비스 목록으로 정리한다', () => {
    expect(parseCompareServices('seveneleven,emart24,unknown,seveneleven')).toEqual([
      'seveneleven',
      'emart24',
    ]);
    expect(parseCompareServices('unknown')).toEqual(['daiso', 'gs25', 'seveneleven', 'emart24']);
  });

  it('MCP 도구 핸들러가 선택한 서비스만 비교한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            totalCnt: 1,
            productList: [{ pluCd: 'e1', goodsNm: '콜라', viewPrice: 1200 }],
          }),
        ),
      ),
    );
    const service = createCompareService();
    const tool = service.getTools()[0];

    const result = await tool.handler({ keyword: '콜라', services: 'emart24', limit: 1 });

    expect(result.structuredContent?.bestPrice).toMatchObject({
      service: 'emart24',
      price: 1200,
    });
    expect(result.content[0]?.text).toContain('"bestPrice"');
  });

  it('MCP 도구 핸들러는 검색어가 없으면 실패한다', async () => {
    const service = createCompareService();
    const tool = service.getTools()[0];

    await expect(tool.handler({ keyword: '   ' })).rejects.toThrow('검색어');
  });

  it('서비스 일부가 실패해도 나머지 비교 결과와 오류를 함께 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              resultSet: {
                result: [
                  {
                    totalSize: 1,
                    resultDocuments: [{ PD_NO: 'd1', PDNM: '콜라', PD_PRC: '1500' }],
                  },
                ],
              },
            }),
          ),
        )
        .mockRejectedValueOnce('raw failure')
        .mockRejectedValueOnce('raw failure'),
    );

    const result = await compareProducts({
      keyword: '콜라',
      services: ['daiso', 'emart24'],
      limit: 1,
    });

    expect(result.bestPrice?.service).toBe('daiso');
    expect(result.errors).toEqual([{ service: 'emart24', message: 'raw failure' }]);
  });

  it('서비스 실패가 Error이면 Error 메시지를 오류 목록에 담는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('network failed'))
        .mockRejectedValueOnce(new Error('network failed')),
    );

    const result = await compareProducts({
      keyword: '콜라',
      services: ['emart24'],
      limit: 1,
    });

    expect(result.errors).toEqual([{ service: 'emart24', message: 'network failed' }]);
  });

  it('가격이 같으면 기본 서비스 순서로 정렬한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              resultSet: {
                result: [
                  {
                    totalSize: 1,
                    resultDocuments: [{ PD_NO: 'd1', PDNM: '다이소 콜라', PD_PRC: '1500' }],
                  },
                ],
              },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                SearchQueryResult: {
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
                              onlinePrice: 1500,
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
        ),
    );

    const result = await compareProducts({
      keyword: '콜라',
      services: ['daiso', 'seveneleven'],
      limit: 1,
    });

    expect(result.results.map((item) => item.service)).toEqual(['daiso', 'seveneleven']);
  });

  it('가격 없는 후보만 있으면 bestPrice를 null로 둔다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
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
                          shortItemName: 'GS25 콜라',
                          stockCheckYn: 'N',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          }),
        ),
      ),
    );

    const result = await compareProducts({
      keyword: '콜라',
      services: ['gs25'],
    });

    expect(result.bestPrice).toBeNull();
    expect(result.results[0]).toMatchObject({
      service: 'gs25',
      name: 'GS25 콜라',
      price: null,
      stockCheckEnabled: false,
    });
  });

  it('빈 서비스 배열은 기본 서비스 목록으로 대체한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ resultSet: { result: [{ totalSize: 0, resultDocuments: [] }] } }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ SearchQueryResult: { Collection: [] } })),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { SearchQueryResult: { Collection: [] } } })),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ totalCnt: 0, productList: [] }))),
    );

    const result = await compareProducts({
      keyword: '콜라',
      services: [],
      limit: 0,
    });

    expect(result.services).toEqual(['daiso', 'gs25', 'seveneleven', 'emart24']);
    expect(result.bestPrice).toBeNull();
  });

  it('세븐일레븐 상품 코드가 없으면 productNo를 코드로 사용한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              SearchQueryResult: {
                Collection: [
                  {
                    CollectionId: 'goods',
                    Documentset: {
                      totalCount: 1,
                      Document: [
                        {
                          field: {
                            prdNo: 'p1',
                            itemOnm: '세븐 콜라',
                            onlinePrice: 0,
                            onlineCost: 1800,
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
      ),
    );

    const result = await compareProducts({
      keyword: '콜라',
      services: ['seveneleven'],
      limit: 99,
    });

    expect(result.results[0]).toMatchObject({
      code: 'p1',
      price: null,
      originalPrice: 1800,
    });
  });
});
