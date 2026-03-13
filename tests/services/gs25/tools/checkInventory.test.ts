/**
 * GS25 재고 확인 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckInventoryTool } from '../../../../src/services/gs25/tools/checkInventory.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createCheckInventoryTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createCheckInventoryTool();

    expect(tool.name).toBe('gs25_check_inventory');
    expect(tool.metadata.title).toBe('GS25 재고 확인');
  });

  it('keyword가 없으면 에러를 던진다', async () => {
    const tool = createCheckInventoryTool();

    await expect(tool.handler({ keyword: '' })).rejects.toThrow('상품 검색어(keyword)를 입력해주세요.');
  });

  it('재고 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [
            {
              storeCode: '1',
              storeName: '강남역점',
              storeAddress: '서울 강남구',
              storeXCoordination: '127',
              storeYCoordination: '37.5',
              searchItemName: '오감자',
              searchItemSellPrice: 1700,
              realStockQuantity: 3,
            },
          ],
        }),
      ),
    );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({
      keyword: '오감자',
      latitude: 37.5,
      longitude: 127,
      storeLimit: 10,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.product.name).toBe('오감자');
    expect(parsed.inventory.inStockStoreCount).toBe(1);
    expect(parsed.inventory.stores[0].distanceM).toBe(0);
  });

  it('storeKeyword 기반 지오코딩이 성공하면 좌표를 반영한다', async () => {
    const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [{ storeCode: 'BASE1', storeName: '강남역점', storeAddress: '서울 강남구 강남대로 1' }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.5, lng: 127 } } }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stores: [
              {
                storeCode: '1',
                storeName: '강남역점',
                storeAddress: '서울 강남구',
                storeXCoordination: '127',
                storeYCoordination: '37.5',
                searchItemName: '오감자',
                realStockQuantity: 1,
              },
            ],
          }),
        ),
      );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '오감자', storeKeyword: '강남' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.geocodeUsed).toBe(true);
    expect(parsed.location).toEqual({ latitude: 37.5, longitude: 127 });

    process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;
  });

  it('상품명이 없으면 note를 반환하고 location은 null이다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          stores: [{ storeCode: '1', storeName: '강남역점', searchItemName: '', realStockQuantity: 0 }],
        }),
      ),
    );

    const tool = createCheckInventoryTool();
    const result = await tool.handler({ keyword: '없는상품' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.location).toBeNull();
    expect(parsed.product.name).toBeNull();
    expect(parsed.note).toContain('응답에 상품명이 없어');
  });
});
