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
          hint: '일시적인 외부 서비스 오류입니다. 잠시 후 재시도해주세요.',
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

describe('설정 오류 진단', () => {
  it.each([
    'Zyte API 호출 실패: 403 Your account has been suspended.',
    'Zyte API 호출 실패: 403 account suspended',
    'ZYTE_API_KEY가 설정되지 않았습니다. .env 또는 Cloudflare Worker Secret을 확인해주세요.',
  ])('설정 오류는 재시도 대신 운영자 조치를 안내한다: %s', (message) => {
    const result = toStandardErrorDiagnostics('GS25_PRODUCT_SEARCH_FAILED', message, {
      status: 500,
    });
    expect(result).toMatchObject({ message, status: 500, retryable: false });
    expect(result.hint).toContain('운영자');
    expect(result.hint).toContain('ZYTE_API_KEY');
    expect(result.hint).toContain('계정');
  });

  it.each([
    ['GS25_PRODUCT_SEARCH_FAILED', 'Zyte API 호출 실패: 403 Forbidden', 500, 403],
    ['GS25_PRODUCT_SEARCH_FAILED', 'upstream account suspended', 500, 403],
    ['GS25_PRODUCT_SEARCH_FAILED', 'Zyte API 호출 실패: 503 unavailable', 503, undefined],
    ['GS25_PRODUCT_SEARCH_FAILED', 'rate limited', 429, undefined],
    ['GS25_TIMEOUT', 'timeout', undefined, undefined],
    ['GS25_TIMEOUT', 'timeout', 408, undefined],
  ])('일반 외부 오류는 재시도 판단을 유지한다: %s %s', (code, message, status, upstreamStatus) => {
    expect(toStandardErrorDiagnostics(code, message, { status, upstreamStatus })).toMatchObject({
      retryable: true,
      hint: '일시적인 외부 서비스 오류입니다. 잠시 후 재시도해주세요.',
    });
  });
});

describe('GS25 인증 장애 안내', () => {
  it('인증 오류에 자동 재시도를 권하지 않는다', () => {
    const diagnostics = toStandardErrorDiagnostics(
      'GS25_UPSTREAM_UNAVAILABLE',
      'GS25 재고 서비스 인증을 사용할 수 없습니다. 운영자는 GS25_API_KEY 설정을 확인하세요.',
      { status: 503 },
    );
    expect(diagnostics.retryable).toBe(false);
    expect(diagnostics.hint).toContain('GS25_API_KEY');
  });
});

describe('Zyte 비용 정책 진단', () => {
  it('서비스 오류로 감싸져도 재시도나 키 설정을 권하지 않는다', () => {
    const diagnostics = toStandardErrorDiagnostics(
      'OLIVEYOUNG_STORE_SEARCH_FAILED',
      '조회 실패: Zyte 유료 호출은 비용 정책에 따라 비활성화되어 있습니다.',
      { status: 503 },
    );
    expect(diagnostics.retryable).toBe(false);
    expect(diagnostics.hint).toContain('비용 정책');
    expect(diagnostics.hint).not.toContain('ZYTE_API_KEY');
  });
});

describe('올리브영 무료 중계 설정 안내', () => {
  it.each([
    '올리브영 릴레이 URL은 HTTPS 또는 로컬 HTTP 주소여야 합니다.',
    'OY_RELAY_TOKEN이 필요합니다.',
    '올리브영 Access 서비스 토큰 설정이 필요합니다.',
    '올리브영 직접 요청 실패. 운영자는 OY_RELAY_URL과 OY_RELAY_TOKEN으로 브라우저 릴레이를 설정해주세요.',
  ])('설정이 필요한 오류는 재시도를 권하지 않는다: %s', (message) => {
    expect(toStandardErrorDiagnostics('OLIVEYOUNG_PRODUCT_SEARCH_FAILED', message, { status: 500 }))
      .toMatchObject({ retryable: false, hint: '운영자는 OY_RELAY_URL과 OY_RELAY_TOKEN 및 브라우저 릴레이 실행 상태를 확인하세요.' });
  });
  it.each(['올리브영 브라우저 릴레이 요청 실패', '올리브영 API 요청 시간 초과'])('일시적인 실행 오류의 재시도는 유지한다: %s', (message) => {
    expect(toStandardErrorDiagnostics('OLIVEYOUNG_PRODUCT_SEARCH_FAILED', message, { status: 500 }).retryable).toBe(true);
  });
});
