/**
 * API 공통 응답 유틸리티 테스트
 */

import { describe, expect, it, vi } from 'vitest';
import { errorResponse } from '../../src/api/response.js';
import type { ApiContext } from '../../src/api/response.js';
import { toStandardErrorDiagnostics } from '../../src/core/errors.js';

function createJsonContext() {
  return {
    json: vi.fn((body: unknown, status?: number) => ({ body, status })),
  } as unknown as ApiContext & { json: ReturnType<typeof vi.fn> };
}

describe('errorResponse', () => {
  it('기존 error 필드를 유지하면서 표준 진단 정보를 함께 반환한다', () => {
    const ctx = createJsonContext();

    errorResponse(ctx, 'GS25_PRODUCT_SEARCH_FAILED', 'upstream failed', 500);

    expect(ctx.json).toHaveBeenCalledWith(
      {
        success: false,
        error: {
          code: 'GS25_PRODUCT_SEARCH_FAILED',
          message: 'upstream failed',
        },
        diagnostics: {
          code: 'GS25_PRODUCT_SEARCH_FAILED',
          message: 'upstream failed',
          status: 500,
          retryable: true,
          service: 'gs25',
          operation: 'product_search',
          upstreamStatus: undefined,
          hint: '일시적인 외부 서비스 오류일 수 있습니다. 잠시 후 다시 시도하세요.',
        },
      },
      500,
    );
  });

  it('서비스/작업을 추론할 수 없으면 operation을 생략한다', () => {
    expect(toStandardErrorDiagnostics('FAILED', 'failed')).toEqual(
      expect.objectContaining({
        code: 'FAILED',
        message: 'failed',
        operation: undefined,
        service: undefined,
        retryable: true,
      }),
    );
  });

  it('빈 에러 코드는 서비스와 작업을 추론하지 않는다', () => {
    expect(toStandardErrorDiagnostics('', 'failed')).toEqual(
      expect.objectContaining({
        code: '',
        operation: undefined,
        service: undefined,
      }),
    );
  });
});
