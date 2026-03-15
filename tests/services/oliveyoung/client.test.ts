/**
 * 올리브영 클라이언트 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enrichOliveyoungProductsWithNearbyStoreInventory,
  fetchOliveyoungStores,
  fetchOliveyoungProducts,
} from '../../../src/services/oliveyoung/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ZYTE_API_KEY;
});

function createZyteResponse(body: unknown, status = 200) {
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
  return new Response(
    JSON.stringify({
      statusCode: status,
      httpResponseBody: encoded,
    }),
    { status }
  );
}

describe('fetchOliveyoungStores', () => {
  it('매장 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          storeList: [
            {
              storeCode: 'D1',
              storeName: '올리브영 A',
              address: '서울',
              latitude: 37.5,
              longitude: 127.0,
              pickupYn: true,
              o2oRemainQuantity: 2,
            },
          ],
        },
      })
    );

    const result = await fetchOliveyoungStores(
      { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
      { apiKey: 'test-key' }
    );

    expect(result.totalCount).toBe(1);
    expect(result.stores[0].pickupYn).toBe(true);
  });

  it('환경 변수 API 키를 사용한다', async () => {
    process.env.ZYTE_API_KEY = 'env-key';
    mockFetch.mockResolvedValue(createZyteResponse({ status: 'SUCCESS', data: { totalCount: 0, storeList: [] } }));

    await fetchOliveyoungStores({ latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.zyte.com/v1/extract',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );
  });

  it('API 키가 없으면 에러를 던진다', async () => {
    await expect(
      fetchOliveyoungStores({ latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' })
    ).rejects.toThrow('ZYTE_API_KEY가 설정되지 않았습니다. .env 또는 Cloudflare Worker Secret을 확인해주세요.');
  });

  it('Zyte HTTP 에러를 처리한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'bad request' }), { status: 400 })
    );

    await expect(
      fetchOliveyoungStores(
        { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('Zyte API 호출 실패: 400 bad request');
  });

  it('Zyte HTTP 에러에서 title 필드를 사용한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ title: 'bad title' }), { status: 401 })
    );

    await expect(
      fetchOliveyoungStores(
        { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('Zyte API 호출 실패: 401 bad title');
  });

  it('Zyte HTTP 에러에서 detail/title이 없으면 상태코드만 사용한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 403 }));

    await expect(
      fetchOliveyoungStores(
        { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('Zyte API 호출 실패: 403');
  });

  it('storeList가 없어도 기본값을 반환한다', async () => {
    mockFetch.mockResolvedValue(createZyteResponse({ status: 'SUCCESS', data: {} }));

    const result = await fetchOliveyoungStores(
      { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
      { apiKey: 'test-key' }
    );

    expect(result.totalCount).toBe(0);
    expect(result.stores).toEqual([]);
  });

  it('매장 필드가 비어있으면 기본값을 사용한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          storeList: [{}],
        },
      })
    );

    const result = await fetchOliveyoungStores(
      { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
      { apiKey: 'test-key' }
    );

    expect(result.stores[0].storeCode).toBe('');
    expect(result.stores[0].storeName).toBe('');
  });

  it('올리브영 API 상태 오류를 처리한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({ status: 'FAIL', data: {} })
    );

    await expect(
      fetchOliveyoungStores(
        { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('올리브영 API 상태 오류: FAIL');
  });

  it('AbortError를 시간 초과 에러로 변환한다', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(
      fetchOliveyoungStores(
        { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('올리브영 API 요청 시간 초과');
  });

  it('타임아웃 콜백이 실행되면 abort를 호출한다', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(
      fetchOliveyoungStores(
        { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('올리브영 API 요청 시간 초과');
  });

  it('btoa가 없으면 Buffer 인코딩 경로를 사용한다', async () => {
    const originalBtoa = globalThis.btoa;
    vi.stubGlobal('btoa', undefined);
    mockFetch.mockResolvedValue(createZyteResponse({ status: 'SUCCESS', data: { totalCount: 0, storeList: [] } }));

    await fetchOliveyoungStores(
      { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
      { apiKey: 'test-key' }
    );

    globalThis.btoa = originalBtoa;
  });

  it('인코딩 수단이 없으면 에러를 던진다', async () => {
    const originalBtoa = globalThis.btoa;
    const originalBuffer = globalThis.Buffer;
    vi.stubGlobal('btoa', undefined);
    vi.stubGlobal('Buffer', undefined);

    await expect(
      fetchOliveyoungStores(
        { latitude: 37.5, longitude: 127.0, pageIdx: 1, searchWords: '' },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('Basic 인증 인코딩을 지원하지 않는 런타임입니다.');

    globalThis.btoa = originalBtoa;
    globalThis.Buffer = originalBuffer;
  });
});

describe('fetchOliveyoungProducts', () => {
  it('상품 목록을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          nextPage: false,
          serachList: [
            {
              goodsNumber: 'A1',
              goodsName: '립밤',
              imagePath: '/uploads/images/goods/10/0000/0001/A00000000000101ko.jpg',
              priceToPay: 5000,
              originalPrice: 7000,
              discountRate: 28,
              o2oStockFlag: true,
              o2oRemainQuantity: 3,
            },
          ],
        },
      })
    );

    const result = await fetchOliveyoungProducts(
      { keyword: '립밤', page: 1, size: 20, sort: '01', includeSoldOut: false },
      { apiKey: 'test-key' }
    );

    expect(result.totalCount).toBe(1);
    expect(result.products[0].goodsName).toBe('립밤');
    expect(result.products[0].imageUrl).toBe(
      'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0001/A00000000000101ko.jpg'
    );
    expect(result.products[0].inStock).toBe(true);
    expect(result.products[0].stockStatus).toBe('in_stock');
    expect(result.products[0].stockSource).toBe('global_search');
  });

  it('절대 이미지 URL은 그대로 유지한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          nextPage: false,
          serachList: [
            {
              goodsNumber: 'A10',
              goodsName: '에센스',
              imagePath: 'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0010/A00000000001001ko.jpg',
            },
          ],
        },
      })
    );

    const result = await fetchOliveyoungProducts(
      { keyword: '에센스', page: 1, size: 20, sort: '01', includeSoldOut: false },
      { apiKey: 'test-key' }
    );

    expect(result.products[0].imageUrl).toBe(
      'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0010/A00000000001001ko.jpg'
    );
  });

  it('프로토콜 상대 이미지 URL은 https로 보정한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          nextPage: false,
          serachList: [
            {
              goodsNumber: 'A11',
              goodsName: '크림',
              imagePath: '//image.oliveyoung.co.kr/uploads/images/goods/10/0000/0011/A00000000001101ko.jpg',
            },
          ],
        },
      })
    );

    const result = await fetchOliveyoungProducts(
      { keyword: '크림', page: 1, size: 20, sort: '01', includeSoldOut: false },
      { apiKey: 'test-key' }
    );

    expect(result.products[0].imageUrl).toBe(
      'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0011/A00000000001101ko.jpg'
    );
  });

  it('슬래시 없는 상대 이미지 경로는 절대 URL로 보정한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          nextPage: false,
          serachList: [
            {
              goodsNumber: 'A12',
              goodsName: '세럼',
              imagePath: '10/0000/0012/A00000000001201ko.jpg?l=ko',
            },
          ],
        },
      })
    );

    const result = await fetchOliveyoungProducts(
      { keyword: '세럼', page: 1, size: 20, sort: '01', includeSoldOut: false },
      { apiKey: 'test-key' }
    );

    expect(result.products[0].imageUrl).toBe(
      'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0012/A00000000001201ko.jpg?l=ko'
    );
  });

  it('o2oRemainQuantity가 0이어도 o2oStockFlag가 true면 재고 있음으로 본다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          nextPage: false,
          serachList: [
            {
              goodsNumber: 'A3',
              goodsName: '마스크팩',
              o2oStockFlag: true,
              o2oRemainQuantity: 0,
            },
          ],
        },
      })
    );

    const result = await fetchOliveyoungProducts(
      { keyword: '팩', page: 1, size: 20, sort: '01', includeSoldOut: false },
      { apiKey: 'test-key' }
    );

    expect(result.products[0].inStock).toBe(true);
    expect(result.products[0].stockStatus).toBe('in_stock');
  });

  it('searchList 대체 필드를 처리한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          nextPage: true,
          searchList: [{ goodsNumber: 'A2', goodsName: '선크림' }],
        },
      })
    );

    const result = await fetchOliveyoungProducts(
      { keyword: '선크림', page: 1, size: 20, sort: '01', includeSoldOut: false },
      { apiKey: 'test-key' }
    );

    expect(result.nextPage).toBe(true);
    expect(result.products[0].goodsNumber).toBe('A2');
  });

  it('상품 필드가 비어있으면 기본값을 사용한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: {
          totalCount: 1,
          nextPage: false,
          serachList: [{}],
        },
      })
    );

    const result = await fetchOliveyoungProducts(
      { keyword: '선크림', page: 1, size: 20, sort: '01', includeSoldOut: false },
      { apiKey: 'test-key' }
    );

    expect(result.products[0].goodsNumber).toBe('');
    expect(result.products[0].imageUrl).toBeUndefined();
    expect(result.products[0].priceToPay).toBe(0);
  });

  it('검색 리스트가 없으면 빈 배열을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: { totalCount: 0, nextPage: false },
      })
    );

    const result = await fetchOliveyoungProducts(
      { keyword: '선크림', page: 1, size: 20, sort: '01', includeSoldOut: false },
      { apiKey: 'test-key' }
    );

    expect(result.products).toEqual([]);
  });

  it('httpResponseBody 누락 오류를 처리한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ statusCode: 200 })));

    await expect(
      fetchOliveyoungProducts(
        { keyword: '선크림', page: 1, size: 20, sort: '01', includeSoldOut: false },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('올리브영 API 응답 실패: 200');
  });

  it('statusCode가 없으면 unknown 오류를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ httpResponseBody: 'abc' }))
    );

    await expect(
      fetchOliveyoungProducts(
        { keyword: '선크림', page: 1, size: 20, sort: '01', includeSoldOut: false },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('올리브영 API 응답 실패: unknown');
  });

  it('status 필드가 없으면 UNKNOWN 오류를 반환한다', async () => {
    const encoded = Buffer.from(JSON.stringify({ data: {} }), 'utf8').toString('base64');
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 200,
          httpResponseBody: encoded,
        })
      )
    );

    await expect(
      fetchOliveyoungProducts(
        { keyword: '선크림', page: 1, size: 20, sort: '01', includeSoldOut: false },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('올리브영 API 상태 오류: UNKNOWN');
  });

  it('atob가 없으면 Buffer 디코딩 경로를 사용한다', async () => {
    const originalAtob = globalThis.atob;
    vi.stubGlobal('atob', undefined);
    mockFetch.mockResolvedValue(
      createZyteResponse({
        status: 'SUCCESS',
        data: { totalCount: 0, nextPage: false, serachList: [] },
      })
    );

    const result = await fetchOliveyoungProducts(
      { keyword: '테스트', page: 1, size: 20, sort: '01', includeSoldOut: false },
      { apiKey: 'test-key' }
    );

    expect(result.totalCount).toBe(0);
    globalThis.atob = originalAtob;
  });

  it('디코딩 수단이 없으면 에러를 던진다', async () => {
    const encodedBody = Buffer.from(
      JSON.stringify({
        status: 'SUCCESS',
        data: { totalCount: 0, nextPage: false, serachList: [] },
      }),
      'utf8'
    ).toString('base64');

    const originalAtob = globalThis.atob;
    const originalBuffer = globalThis.Buffer;
    vi.stubGlobal('atob', undefined);
    vi.stubGlobal('Buffer', undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        statusCode: 200,
        httpResponseBody: encodedBody,
      }),
    });

    await expect(
      fetchOliveyoungProducts(
        { keyword: '테스트', page: 1, size: 20, sort: '01', includeSoldOut: false },
        { apiKey: 'test-key' }
      )
    ).rejects.toThrow('Base64 디코딩을 지원하지 않는 런타임입니다.');

    globalThis.atob = originalAtob;
    globalThis.Buffer = originalBuffer;
  });
});

describe('enrichOliveyoungProductsWithNearbyStoreInventory', () => {
  it('상품별 주변 매장 수량 정보를 붙이고 재고 있는 상품을 앞으로 정렬한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: { goodsInfo: { masterGoodsNumber: '8801' } },
        })
      )
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 2,
            storeList: [
              { storeCode: 'B040', storeName: '안산중앙역점', salesStoreYn: true, remainQuantity: 4 },
              { storeCode: 'B041', storeName: '안산중앙점', salesStoreYn: false, remainQuantity: 0 },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: { goodsInfo: { masterGoodsNumber: '8802' } },
        })
      )
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 1,
            storeList: [
              { storeCode: 'B042', storeName: '안산고잔점', salesStoreYn: true, remainQuantity: 0 },
            ],
          },
        })
      );

    const result = await enrichOliveyoungProductsWithNearbyStoreInventory(
      [
        {
          goodsNumber: 'A1',
          goodsName: '팩 A',
          priceToPay: 10000,
          originalPrice: 12000,
          discountRate: 16,
          o2oStockFlag: true,
          o2oRemainQuantity: 0,
          inStock: true,
          stockStatus: 'in_stock',
          stockSource: 'global_search',
        },
        {
          goodsNumber: 'A2',
          goodsName: '팩 B',
          priceToPay: 11000,
          originalPrice: 13000,
          discountRate: 15,
          o2oStockFlag: true,
          o2oRemainQuantity: 0,
          inStock: true,
          stockStatus: 'in_stock',
          stockSource: 'global_search',
        },
      ],
      {
        latitude: 37.3171,
        longitude: 126.8389,
        storeKeyword: '안산중앙역',
        maxProducts: 5,
      },
      { apiKey: 'test-key' }
    );

    expect(result.checkedCount).toBe(2);
    expect(result.products[0].goodsName).toBe('팩 A');
    expect(result.products[0].stockSource).toBe('nearby_store');
    expect(result.products[0].storeInventory?.stores[0].stockLabel).toBe('재고 4개');
    expect(result.products[0].storeInventory?.stores[1].stockStatus).toBe('not_sold');
    expect(result.products[1].stockStatus).toBe('out_of_stock');
  });

  it('maxProducts가 0이면 원본 상품을 그대로 반환한다', async () => {
    const products = [
      {
        goodsNumber: 'A1',
        goodsName: '팩 A',
        priceToPay: 10000,
        originalPrice: 12000,
        discountRate: 16,
        o2oStockFlag: true,
        o2oRemainQuantity: 1,
        inStock: true,
        stockStatus: 'in_stock' as const,
        stockSource: 'global_search' as const,
      },
    ];

    const result = await enrichOliveyoungProductsWithNearbyStoreInventory(
      products,
      {
        latitude: 37.3171,
        longitude: 126.8389,
        storeKeyword: '안산중앙역',
        maxProducts: 0,
      },
      { apiKey: 'test-key' }
    );

    expect(result.checkedCount).toBe(0);
    expect(result.products).toEqual(products);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('goods info에 masterGoodsNumber가 없으면 상품을 그대로 유지한다', async () => {
    mockFetch.mockResolvedValueOnce(
      createZyteResponse({
        status: 'SUCCESS',
        data: { goodsInfo: {} },
      })
    );

    const products = [
      {
        goodsNumber: 'A1',
        goodsName: '팩 A',
        priceToPay: 10000,
        originalPrice: 12000,
        discountRate: 16,
        o2oStockFlag: true,
        o2oRemainQuantity: 1,
        inStock: true,
        stockStatus: 'in_stock' as const,
        stockSource: 'global_search' as const,
      },
      {
        goodsNumber: 'A2',
        goodsName: '팩 B',
        priceToPay: 12000,
        originalPrice: 14000,
        discountRate: 14,
        o2oStockFlag: false,
        o2oRemainQuantity: 0,
        inStock: false,
        stockStatus: 'out_of_stock' as const,
        stockSource: 'global_search' as const,
      },
    ];

    const result = await enrichOliveyoungProductsWithNearbyStoreInventory(
      products,
      {
        latitude: 37.3171,
        longitude: 126.8389,
        storeKeyword: '안산중앙역',
        maxProducts: 1,
      },
      { apiKey: 'test-key' }
    );

    expect(result.checkedCount).toBe(0);
    expect(result.products).toEqual(products);
  });

  it('stock-stores 응답에 빈 데이터가 오면 주변 매장 재고를 품절로 처리한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: { goodsInfo: { masterGoodsNumber: '8803' } },
        })
      )
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: {},
        })
      );

    const result = await enrichOliveyoungProductsWithNearbyStoreInventory(
      [
        {
          goodsNumber: 'A3',
          goodsName: '팩 C',
          priceToPay: 9000,
          originalPrice: 10000,
          discountRate: 10,
          o2oStockFlag: true,
          o2oRemainQuantity: 1,
          inStock: true,
          stockStatus: 'in_stock',
          stockSource: 'global_search',
        },
      ],
      {
        latitude: 37.3171,
        longitude: 126.8389,
        storeKeyword: '안산중앙역',
        maxProducts: 1,
      },
      { apiKey: 'test-key' }
    );

    expect(result.checkedCount).toBe(1);
    expect(result.products[0].stockSource).toBe('nearby_store');
    expect(result.products[0].inStock).toBe(false);
    expect(result.products[0].stockStatus).toBe('out_of_stock');
    expect(result.products[0].storeInventory).toEqual({
      totalCount: 0,
      inStockCount: 0,
      outOfStockCount: 0,
      notSoldCount: 0,
      stores: [],
    });
  });

  it('stock-stores 항목이 비어 있어도 기본값과 재고 라벨을 계산한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: { goodsInfo: { masterGoodsNumber: '8804' } },
        })
      )
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 1,
            storeList: [undefined],
          },
        })
      );

    const result = await enrichOliveyoungProductsWithNearbyStoreInventory(
      [
        {
          goodsNumber: 'A4',
          goodsName: '팩 D',
          priceToPay: 13000,
          originalPrice: 15000,
          discountRate: 13,
          o2oStockFlag: false,
          o2oRemainQuantity: 0,
          inStock: false,
          stockStatus: 'out_of_stock',
          stockSource: 'global_search',
        },
      ],
      {
        latitude: 37.3171,
        longitude: 126.8389,
        storeKeyword: '안산중앙역',
        maxProducts: 1,
      },
      { apiKey: 'test-key' }
    );

    expect(result.checkedCount).toBe(1);
    expect(result.products[0].storeInventory?.stores[0]).toEqual({
      storeCode: '',
      storeName: '',
      address: '',
      latitude: 0,
      longitude: 0,
      distance: 0,
      pickupYn: false,
      salesStoreYn: false,
      remainQuantity: 0,
      o2oRemainQuantity: 0,
      stockStatus: 'not_sold',
      stockLabel: '미판매',
      openYn: false,
    });
  });
});
