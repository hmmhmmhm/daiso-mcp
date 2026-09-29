/**
 * CGV 원본 및 대체 전송 경로를 사용할 수 없는 상태
 */

import { ServiceError, ZYTE_COST_POLICY_MESSAGE } from '../../core/errors.js';

export class CgvUpstreamUnavailableError extends ServiceError {
  constructor(upstreamStatus?: number) {
    const statusSuffix = upstreamStatus === undefined ? '' : ` (HTTP ${upstreamStatus})`;
    super(
      'CGV_UPSTREAM_UNAVAILABLE',
      `CGV 원본 서비스에 연결할 수 없습니다. ${ZYTE_COST_POLICY_MESSAGE}${statusSuffix}`,
      503,
      false,
      upstreamStatus,
    );
    this.name = 'CgvUpstreamUnavailableError';
  }
}

export function isCgvUpstreamUnavailableError(
  error: unknown,
): error is CgvUpstreamUnavailableError {
  return error instanceof CgvUpstreamUnavailableError;
}
