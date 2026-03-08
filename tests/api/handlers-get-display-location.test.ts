/**
 * API 핸들러 테스트 - 진열 위치 조회
 */

import { describe, it, expect, vi } from 'vitest';
import { handleGetDisplayLocation } from '../../src/api/handlers.js';
import { createMockContext, setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('handleGetDisplayLocation', () => {
  it('진열 위치 정보를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ zoneNo: '60', stairNo: '2', storeErp: '04515' }],
        }),
      ),
    );

    const ctx = createMockContext({ productId: '12345', storeCode: '04515' });
    await handleGetDisplayLocation(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          productId: '12345',
          storeCode: '04515',
          hasLocation: true,
        }),
      }),
    );
  });

  it('productId가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({ storeCode: '04515' });
    await handleGetDisplayLocation(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_PRODUCT_ID', message: '상품 ID(productId)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('storeCode가 없으면 에러를 반환한다', async () => {
    const ctx = createMockContext({ productId: '12345' });
    await handleGetDisplayLocation(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'MISSING_STORE_CODE', message: '매장 코드(storeCode)를 입력해주세요.' },
      }),
      400,
    );
  });

  it('API 에러 시 500 에러를 반환한다', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const ctx = createMockContext({ productId: '12345', storeCode: '04515' });
    await handleGetDisplayLocation(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'DISPLAY_LOCATION_FAILED', message: 'Network error' },
      }),
      500,
    );
  });

  it('알 수 없는 에러도 처리한다', async () => {
    mockFetch.mockRejectedValue('Unknown error');

    const ctx = createMockContext({ productId: '12345', storeCode: '04515' });
    await handleGetDisplayLocation(ctx);

    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: 'DISPLAY_LOCATION_FAILED', message: '알 수 없는 오류가 발생했습니다.' },
      }),
      500,
    );
  });
});
