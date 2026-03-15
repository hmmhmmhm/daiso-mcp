/**
 * API 핸들러 테스트 - 재고 확인
 */

import { describe, it, expect, vi } from 'vitest';
import { handleCheckInventory } from '../../src/api/handlers.js';
import { createMockContext, createMockProductResponse, setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('handleCheckInventory', () => {
  it('재고 정보를 반환한다', async () => {
    // 온라인 재고 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { stck: 50 } })));
    // 매장 재고 응답
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            msStrVOList: [
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
                qty: '5',
              },
            ],
            intStrCont: 1,
          },
        }),
      ),
    );
    // 상품 메타데이터 응답
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(createMockProductResponse([
        {
          PD_NO: '12345',
          PDNM: '테스트상품',
          PD_PRC: '5000',
          ATCH_FILE_URL: '/img.jpg',
          BRND_NM: '다이소',
          SOLD_OUT_YN: 'N',
          NEW_PD_YN: 'Y',
        },
      ]))),
    );

    const ctx = createMockContext({ productId: '12345' });
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          productId: '12345',
          product: expect.objectContaining({
            id: '12345',
            name: '테스트상품',
            imageUrl: expect.stringContaining('/img.jpg'),
          }),
          onlineStock: 50,
          storeInventory: expect.any(Object),
        }),
      }),
    );
  });

  it('productId가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({});
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_PRODUCT_ID', message: '제품 ID(productId)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('위치 파라미터를 처리한다', async () => {
    // 온라인 재고 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
    // 매장 재고 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
    // 상품 메타데이터 응답
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ resultSet: { result: [{}] } })));

    const ctx = createMockContext({ productId: '12345', lat: '35.1', lng: '129.0' });
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          location: { latitude: 35.1, longitude: 129.0 },
        }),
      }),
    );
  });

  it('API 에러 시 500 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('API Error'));

    const ctx = createMockContext({ productId: '12345' });
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'INVENTORY_CHECK_FAILED', message: 'API Error' },
      }),
      500,
    );
  });

  it('알 수 없는 에러도 처리한다', async () => {
    mockFetch.mockRejectedValue(123);

    const ctx = createMockContext({ productId: '12345' });
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'INVENTORY_CHECK_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500,
    );
  });

  it('상품 메타데이터 조회가 실패해도 재고 정보를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { stck: 50 } })));
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { msStrVOList: [], intStrCont: 0 } })));
    mockFetch.mockRejectedValueOnce(new Error('metadata failed'));

    const ctx = createMockContext({ productId: '12345' });
    await handleCheckInventory(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          productId: '12345',
          product: undefined,
        }),
      }),
    );
  });
});
