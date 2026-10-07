import { EXTERNAL_SERVICE_RETRY_HINT, type SevenStockFailure } from '../utils/sevenStockFailure.js';
/**
 * MCP/API 공통 에러 진단 구조
 */

import type { RelayQuota } from '../utils/relayQuota.js';

export const ZYTE_COST_POLICY_MESSAGE = 'Zyte 유료 호출은 비용 정책에 따라 비활성화되어 있습니다.';

export interface StandardErrorDiagnostics {
  code: string;
  message: string;
  status?: number;
  retryable: boolean;
  service?: string;
  operation?: string;
  upstreamStatus?: number;
  upstreamCode?: number;
  upstreamMessage?: string;
  quotaReason?: RelayQuota['quotaReason'];
  retryAfter?: number;
  hint: string;
}

/** 허용된 공개 오류 문구만 API와 MCP에 전달합니다. */
export class ServiceError extends Error {
  readonly quotaReason?: RelayQuota['quotaReason'];
  readonly retryAfter?: number;
  constructor(
    readonly code: string,
    message: string,
    readonly status: 429 | 502 | 503 | 504,
    readonly retryable: boolean,
    readonly upstreamStatus?: number,
    quota?: RelayQuota,
    readonly upstreamError?: SevenStockFailure,
  ) {
    super(message);
    this.name = 'ServiceError';
    this.quotaReason = quota?.quotaReason;
    this.retryAfter = quota?.retryAfter;
  }
}

const SERVICE_PREFIXES = [
  'daiso',
  'gs25',
  'seveneleven',
  'cu',
  'emart24',
  'lottemart',
  'megabox',
  'lottecinema',
  'cgv',
  'dtryx',
  'oliveyoung',
] as const;

function normalizeService(value: string): string {
  return value.toLowerCase().replace(/_/g, '');
}

function toOperation(parts: string[]): string | undefined {
  const filtered = parts.filter((part) => part.length > 0 && part !== 'FAILED');
  if (filtered.length === 0) {
    return undefined;
  }
  return filtered.map((part) => part.toLowerCase()).join('_');
}

function inferServiceAndOperation(
  code: string,
): Pick<StandardErrorDiagnostics, 'service' | 'operation'> {
  const parts = code.split('_').filter((part) => part.length > 0);
  const normalizedFirst = normalizeService(parts[0] || '');
  const service = SERVICE_PREFIXES.find((item) => normalizeService(item) === normalizedFirst);

  if (!service) {
    return { operation: toOperation(parts) };
  }

  return {
    service,
    operation: toOperation(parts.slice(1)),
  };
}

function isRetryable(code: string, status?: number): boolean {
  if (typeof status === 'number') {
    return status >= 500 || status === 408 || status === 429;
  }

  const normalized = code.toUpperCase();
  return normalized.includes('TIMEOUT') || normalized.includes('FAILED');
}

function buildHint(retryable: boolean): string {
  return retryable ? EXTERNAL_SERVICE_RETRY_HINT : '입력값 또는 요청 조건을 확인하세요.';
}

export function toStandardErrorDiagnostics(
  code: string,
  message: string,
  options: {
    status?: number;
    operation?: string;
    service?: string;
    upstreamStatus?: number;
  } = {},
): StandardErrorDiagnostics {
  const inferred = inferServiceAndOperation(code);
  const costPolicyError = message.includes(ZYTE_COST_POLICY_MESSAGE);
  // 실제 Zyte 진단 문구만 설정 오류로 취급해 일반적인 접근 차단과 구분합니다.
  const configurationError = [
    'Zyte API 호출 실패: 403 Your account has been suspended.',
    'Zyte API 호출 실패: 403 account suspended',
    'ZYTE_API_KEY가 설정되지 않았습니다.',
  ].some((diagnostic) => message.includes(diagnostic));
  const gs25AuthenticationError = message.includes('GS25 재고 서비스 인증을 사용할 수 없습니다.');
  const oliveyoungRelayConfigurationError = [
    '올리브영 릴레이 URL은 HTTPS 또는 로컬 HTTP 주소여야 합니다.',
    'OY_RELAY_TOKEN이 필요합니다.',
    '올리브영 Access 서비스 토큰 설정이 필요합니다.',
    '올리브영 직접 요청 실패. 운영자는 OY_RELAY_URL과 OY_RELAY_TOKEN으로 브라우저 릴레이를 설정해주세요.',
  ].includes(message);
  const retryable =
    !oliveyoungRelayConfigurationError &&
    !costPolicyError &&
    !configurationError &&
    !gs25AuthenticationError &&
    isRetryable(code, options.status || options.upstreamStatus);

  return {
    code,
    message,
    status: options.status,
    retryable,
    service: options.service || inferred.service,
    operation: options.operation || inferred.operation,
    upstreamStatus: options.upstreamStatus,
    hint: oliveyoungRelayConfigurationError
      ? '운영자는 OY_RELAY_URL과 OY_RELAY_TOKEN 및 브라우저 릴레이 실행 상태를 확인하세요.'
      : costPolicyError
        ? ZYTE_COST_POLICY_MESSAGE
        : gs25AuthenticationError
          ? '운영자는 GS25_API_KEY 설정을 확인하세요.'
          : configurationError
            ? '운영자는 ZYTE_API_KEY 설정과 Zyte 계정 상태를 확인하세요.'
            : buildHint(retryable),
  };
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

/** 전송 계층에서 확인한 재시도 가능 여부를 공통 진단에도 유지합니다. */
export function toServiceErrorDiagnostics(
  error: ServiceError,
  operation: string,
): StandardErrorDiagnostics {
  return {
    ...toStandardErrorDiagnostics(error.code, error.message, {
      status: error.status,
      upstreamStatus: error.upstreamStatus,
      operation,
    }),
    retryable: error.retryable,
    quotaReason: error.quotaReason,
    retryAfter: error.retryAfter,
    ...(error.upstreamError
      ? { upstreamCode: error.upstreamError.code, upstreamMessage: error.upstreamError.message }
      : {}),
    hint: error.upstreamError ? EXTERNAL_SERVICE_RETRY_HINT : buildHint(error.retryable),
  };
}
