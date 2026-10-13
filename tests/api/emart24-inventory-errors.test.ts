import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleEmart24CheckInventory } from '../../src/api/emart24Handlers.js';
import { ServiceError } from '../../src/core/errors.js';
import * as inventoryLookup from '../../src/services/emart24/inventoryLookup.js';

function context(query: Record<string, string> = { pluCd: '123', bizNoArr: '00940' }) {
  return {
    env: {},
    req: { query: (name: string) => query[name] },
    header: vi.fn(),
    json: vi.fn((data, status = 200) => ({ data, status })),
  } as unknown as Parameters<typeof handleEmart24CheckInventory>[0];
}

afterEach(() => vi.restoreAllMocks());

describe('이마트24 재고 전송 오류 보존', () => {
  it.each([
    new ServiceError(
      'CONVENIENCE_RELAY_FAILED',
      '편의점 릴레이 요청에 실패했습니다.',
      502,
      true,
      403,
    ),
    new ServiceError(
      'CONVENIENCE_RELAY_FAILED',
      '편의점 릴레이 요청에 실패했습니다.',
      429,
      true,
      429,
      { quotaReason: 'daily', retryAfter: 120 },
    ),
    new ServiceError(
      'CONVENIENCE_RELAY_CONFIG_ERROR',
      '편의점 릴레이 설정을 확인하세요.',
      503,
      false,
    ),
    new ServiceError(
      'CONVENIENCE_RELAY_TIMEOUT',
      '편의점 릴레이 요청 시간이 초과되었습니다.',
      504,
      true,
    ),
  ])('알려진 $status 오류의 코드·진단·재시도 정보를 반환한다', async (error) => {
    const lookup = vi.spyOn(inventoryLookup, 'lookupEmart24Inventory').mockRejectedValue(error);
    const c = context();
    await handleEmart24CheckInventory(c);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: { code: error.code, message: error.message },
        diagnostics: expect.objectContaining({
          code: error.code,
          status: error.status,
          retryable: error.retryable,
          upstreamStatus: error.upstreamStatus,
          operation: 'emart24_inventory',
          quotaReason: error.quotaReason,
          retryAfter: error.retryAfter,
        }),
      }),
      error.status,
    );
    if (error.retryAfter !== undefined) {
      expect(c.header).toHaveBeenCalledWith('Retry-After', '120');
    } else {
      expect(c.header).not.toHaveBeenCalled();
    }
  });

  it.each([new Error('예상하지 못한 오류'), undefined])(
    '일반 오류는 기존 500 응답을 유지한다',
    async (error) => {
      vi.spyOn(inventoryLookup, 'lookupEmart24Inventory').mockRejectedValue(error);
      const c = context();
      await handleEmart24CheckInventory(c);
      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: 'EMART24_INVENTORY_CHECK_FAILED',
            message: error?.message ?? '알 수 없는 오류가 발생했습니다.',
          },
          diagnostics: expect.objectContaining({
            code: 'EMART24_INVENTORY_CHECK_FAILED',
            status: 500,
          }),
        }),
        500,
      );
      expect(c.header).not.toHaveBeenCalled();
    },
  );
});
