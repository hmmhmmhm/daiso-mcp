/**
 * 재고 확인 도구 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchOnlineStock,
  fetchStoreInventory,
  createCheckInventoryTool,
} from '../../../../src/services/daiso/tools/checkInventory.js';
import { createMockProductResponse } from '../../../api/testHelpers.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchOnlineStock', () => {
  it('온라인 재고 수량을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { pdNo: '12345', stck: 50 } }))
    );

    const stock = await fetchOnlineStock('12345');

    expect(stock).toBe(50);
  });

  it('실패 시 0을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false }))
    );

    const stock = await fetchOnlineStock('12345');

    expect(stock).toBe(0);
  });

  it('성공 응답에 재고 데이터가 없으면 0을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }))
    );

    const stock = await fetchOnlineStock('12345');

    expect(stock).toBe(0);
  });
});

describe('fetchStoreInventory', () => {
  it('매장 조회 + 인증 재고 조회 결과를 합쳐 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: [
            {
              strCd: 'STR001',
              strNm: '테스트점',
              strAddr: '서울시 테스트구',
              strTno: '02-1234-5678',
              opngTime: '0900',
              clsngTime: '2200',
              strLttd: 37.5665,
              strLitd: 126.978,
              km: '1.5km',
              parkYn: 'Y',
              usimYn: 'N',
              pkupYn: 'Y',
              taxfYn: 'N',
              elvtYn: 'Y',
              entrRampYn: 'N',
              nocashYn: 'Y',
            },
          ],
        }))
      )
      .mockResolvedValueOnce(
        new Response('sample-token', {
          headers: { 'X-DM-UID': 'dm-uid-123' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          data: [{ pdNo: '12345', strCd: 'STR001', stck: '10' }],
        }))
      );

    const result = await fetchStoreInventory('12345', 37.5, 127.0);

    expect(result.totalCount).toBe(1);
    expect(result.stores[0]).toEqual({
      storeCode: 'STR001',
      storeName: '테스트점',
      address: '서울시 테스트구',
      phone: '02-1234-5678',
      openTime: '0900',
      closeTime: '2200',
      lat: 37.5665,
      lng: 126.978,
      distance: '1.5km',
      quantity: 10,
      options: {
        parking: true,
        simCard: false,
        pickup: true,
        taxFree: false,
        elevator: true,
        ramp: false,
        cashless: true,
      },
    });
  });

  it('재고 응답에 없거나 숫자가 아닌 매장은 0으로 처리한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: [
            {
              strCd: 'STR001',
              strNm: '테스트점',
              strAddr: '',
              strTno: '',
              opngTime: '',
              clsngTime: '',
              strLttd: 0,
              strLitd: 0,
              km: '0.1km',
              parkYn: 'N',
              usimYn: 'N',
              pkupYn: 'N',
              taxfYn: 'N',
            },
            {
              strCd: 'STR002',
              strNm: '테스트점2',
              strAddr: '',
              strTno: '',
              opngTime: '',
              clsngTime: '',
              strLttd: 0,
              strLitd: 0,
              km: '0.2km',
              parkYn: 'N',
              usimYn: 'N',
              pkupYn: 'N',
              taxfYn: 'N',
            },
          ],
        }))
      )
      .mockResolvedValueOnce(
        new Response('sample-token', {
          headers: { 'X-DM-UID': 'dm-uid-123' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: [{ pdNo: '12345', strCd: 'STR002', stck: 'NaN' }] }))
      );

    const result = await fetchStoreInventory('12345', 37.5, 127.0);

    expect(result.stores[0].quantity).toBe(0);
    expect(result.stores[1].quantity).toBe(0);
  });

  it('재고 응답 data가 없으면 모든 매장을 0으로 처리한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: [
            {
              strCd: 'STR001',
              strNm: '테스트점',
              strAddr: '',
              strTno: '',
              opngTime: '',
              clsngTime: '',
              strLttd: 0,
              strLitd: 0,
              km: '0.1km',
              parkYn: 'N',
              usimYn: 'N',
              pkupYn: 'N',
              taxfYn: 'N',
            },
          ],
        }))
      )
      .mockResolvedValueOnce(
        new Response('sample-token', {
          headers: { 'X-DM-UID': 'dm-uid-123' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }))
      );

    const result = await fetchStoreInventory('12345', 37.5, 127.0);

    expect(result.stores[0].quantity).toBe(0);
  });

  it('매장 검색 결과가 비면 붙여쓴 키워드로 재시도한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: [
            {
              strCd: '11199',
              strNm: '안산중앙점',
              strAddr: '경기 안산시',
              strTno: '1522-4400',
              opngTime: '1000',
              clsngTime: '2200',
              strLttd: 37.3,
              strLitd: 126.8,
              km: '0.1',
              parkYn: 'N',
              usimYn: 'N',
              pkupYn: 'N',
              taxfYn: 'N',
            },
          ],
        }))
      )
      .mockResolvedValueOnce(
        new Response('sample-token', {
          headers: { 'X-DM-UID': 'dm-uid-123' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          data: [{ pdNo: '12345', strCd: '11199', stck: '3' }],
        }))
      );

    const result = await fetchStoreInventory('12345', 37.5, 127.0, 1, 30, '안산 중앙역');

    expect(result.totalCount).toBe(1);
    expect(result.stores[0].storeCode).toBe('11199');

    const firstRequestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const secondRequestBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(firstRequestBody.keyword).toBe('안산 중앙역');
    expect(secondRequestBody.keyword).toBe('안산중앙역');
  });

  it('모든 키워드 검색 결과가 비면 빈 결과를 반환한다', async () => {
    mockFetch.mockImplementation(async () => new Response(JSON.stringify({ data: [] })));

    const result = await fetchStoreInventory('12345', 37.5, 127.0, 1, 30, '안산 중앙역');

    expect(result).toEqual({ stores: [], totalCount: 0 });
  });
});

describe('createCheckInventoryTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createCheckInventoryTool();

    expect(tool.name).toBe('daiso_check_inventory');
    expect(tool.metadata.title).toBe('재고 확인');
  });

  it('도구 설명은 상품명만 아는 MCP 사용자를 제품 검색으로 유도한다', () => {
    const tool = createCheckInventoryTool();

    expect(tool.metadata.description).toContain('상품명만 아는 경우');
    expect(tool.metadata.description).toContain('daiso_search_products');
    expect(tool.metadata.inputSchema.productId.description).toContain('상품명만 알면 먼저 daiso_search_products');
  });

  it('productId가 없으면 에러를 던진다', async () => {
    const tool = createCheckInventoryTool();

    await expect(tool.handler({ productId: '' })).rejects.toThrow('상품 ID(productId)를 입력해주세요.');
    await expect(tool.handler({ productId: '  ' })).rejects.toThrow('상품 ID(productId)를 입력해주세요.');
  });

  it('상품 요약 조회가 실패해도 재고 결과를 반환한다', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('selOnlStck')) {
        return new Response(JSON.stringify({ success: true, data: { stck: 7 } }));
      }

      if (url.includes('FindStoreGoods')) {
        throw new Error('product lookup failed');
      }

      if (url.includes('/ms/msg/selStr')) {
        return new Response(JSON.stringify({ data: [] }));
      }

      throw new Error(`unexpected url: ${url}`);
    });

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ productId: '12345' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.product).toBeUndefined();
    expect(parsed.onlineStock).toBe(7);
    expect(parsed.storeInventory.totalStores).toBe(0);
  });

  it('상품 요약 조회 결과가 비어도 재고 결과를 반환한다', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('selOnlStck')) {
        return new Response(JSON.stringify({ success: true, data: { stck: 7 } }));
      }

      if (url.includes('FindStoreGoods')) {
        return new Response(JSON.stringify(createMockProductResponse([])));
      }

      if (url.includes('/ms/msg/selStr')) {
        return new Response(JSON.stringify({ data: [] }));
      }

      throw new Error(`unexpected url: ${url}`);
    });

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ productId: '12345' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.product).toBeUndefined();
    expect(parsed.onlineStock).toBe(7);
    expect(parsed.storeInventory.totalStores).toBe(0);
  });

  it('온라인 재고와 매장 재고를 함께 반환한다', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('selOnlStck')) {
        return new Response(JSON.stringify({ success: true, data: { stck: 100 } }));
      }

      if (url.includes('FindStoreGoods')) {
        return new Response(JSON.stringify(createMockProductResponse([
          {
            PD_NO: '12345',
            PDNM: '테스트상품',
            ATCH_FILE_URL: '/images/test.jpg',
            BRND_NM: '다이소',
            SOLD_OUT_YN: 'N',
            NEW_PD_YN: 'Y',
            PD_PRC: '1000',
          },
        ])));
      }

      if (url.includes('/ms/msg/selStr')) {
        return new Response(JSON.stringify({
          data: [
            {
              strCd: '1',
              strNm: '매장A',
              strAddr: '',
              strTno: '',
              opngTime: '',
              clsngTime: '',
              strLttd: 0,
              strLitd: 0,
              km: '',
              parkYn: 'N',
              usimYn: 'N',
              pkupYn: 'N',
              taxfYn: 'N',
            },
            {
              strCd: '2',
              strNm: '매장B',
              strAddr: '',
              strTno: '',
              opngTime: '',
              clsngTime: '',
              strLttd: 0,
              strLitd: 0,
              km: '',
              parkYn: 'N',
              usimYn: 'N',
              pkupYn: 'N',
              taxfYn: 'N',
            },
          ],
        }));
      }

      if (url.includes('/auth/request')) {
        return new Response('sample-token', {
          headers: { 'X-DM-UID': 'dm-uid-123' },
        });
      }

      if (url.includes('selStrPkupStck')) {
        return new Response(JSON.stringify({
          success: true,
          data: [
            { pdNo: '12345', strCd: '1', stck: '5' },
            { pdNo: '12345', strCd: '2', stck: '0' },
          ],
        }));
      }

      throw new Error(`unexpected url: ${url}`);
    });

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ productId: '12345' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.product).toEqual({
      id: '12345',
      name: '테스트상품',
      imageUrl: expect.stringContaining('/images/test.jpg'),
      brand: '다이소',
      soldOut: false,
      isNew: true,
    });
    expect(parsed.onlineStock).toBe(100);
    expect(parsed.storeInventory.inStockCount).toBe(1);
    expect(parsed.storeInventory.outOfStockCount).toBe(1);
    expect(parsed.storeInventory.totalStores).toBe(2);
  });
});
