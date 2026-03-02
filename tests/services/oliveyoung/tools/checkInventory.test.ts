/**
 * 올리브영 재고 파악 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckInventoryTool } from '../../../../src/services/oliveyoung/tools/checkInventory.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createZyteResponse(body: unknown) {
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
  return new Response(
    JSON.stringify({
      statusCode: 200,
      httpResponseBody: encoded,
    })
  );
}

describe('createCheckInventoryTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createCheckInventoryTool('test-key');

    expect(tool.name).toBe('oliveyoung_check_inventory');
    expect(tool.metadata.title).toBe('올리브영 재고 파악');
  });

  it('keyword가 없으면 에러를 던진다', async () => {
    const tool = createCheckInventoryTool('test-key');

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });

  it('주변 매장과 재고 결과를 함께 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 1,
            storeList: [
              {
                storeCode: 'D176',
                storeName: '올리브영 명동 타운',
                address: '서울 중구 명동길 53',
                latitude: 37.564,
                longitude: 126.985,
                pickupYn: false,
                o2oRemainQuantity: 0,
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 2,
            nextPage: false,
            serachList: [
              {
                goodsNumber: 'A1',
                goodsName: '선크림 A',
                priceToPay: 10000,
                originalPrice: 15000,
                discountRate: 33,
                o2oStockFlag: true,
                o2oRemainQuantity: 5,
              },
              {
                goodsNumber: 'A2',
                goodsName: '선크림 B',
                priceToPay: 12000,
                originalPrice: 12000,
                discountRate: 0,
                o2oStockFlag: false,
                o2oRemainQuantity: 0,
              },
            ],
          },
        })
      );

    const tool = createCheckInventoryTool('test-key');
    const result = await tool.handler({ keyword: '선크림', storeKeyword: '명동' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nearbyStores.totalCount).toBe(1);
    expect(parsed.inventory.totalCount).toBe(2);
    expect(parsed.inventory.inStockCount).toBe(1);
    expect(parsed.inventory.outOfStockCount).toBe(1);
  });

  it('상품 API의 searchList 오타 보정 필드를 처리한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 0,
            storeList: [],
          },
        })
      )
      .mockResolvedValueOnce(
        createZyteResponse({
          status: 'SUCCESS',
          data: {
            totalCount: 1,
            nextPage: false,
            searchList: [
              {
                goodsNumber: 'A1',
                goodsName: '립밤 A',
                priceToPay: 5000,
                originalPrice: 7000,
                discountRate: 28,
                o2oStockFlag: true,
                o2oRemainQuantity: 2,
              },
            ],
          },
        })
      );

    const tool = createCheckInventoryTool('test-key');
    const result = await tool.handler({ keyword: '립밤' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.inventory.products).toHaveLength(1);
    expect(parsed.inventory.products[0].goodsName).toBe('립밤 A');
  });
});
