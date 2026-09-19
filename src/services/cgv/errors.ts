/**
 * CGV 원본 및 대체 전송 경로를 사용할 수 없는 상태
 */

import { ZYTE_COST_POLICY_MESSAGE } from '../../core/errors.js';

export class CgvUpstreamUnavailableError extends Error {
  constructor(readonly upstreamStatus?: number) {
    const statusSuffix = upstreamStatus === undefined ? '' : ` (HTTP ${upstreamStatus})`;
    super(`CGV 원본 서비스에 연결할 수 없습니다. ${ZYTE_COST_POLICY_MESSAGE}${statusSuffix}`);
    this.name = 'CgvUpstreamUnavailableError';
  }
}

export function isCgvUpstreamUnavailableError(
  error: unknown,
): error is CgvUpstreamUnavailableError {
  return error instanceof CgvUpstreamUnavailableError;
}
