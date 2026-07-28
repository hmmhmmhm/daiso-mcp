/**
 * CGV 원본 및 대체 전송 경로를 사용할 수 없는 상태
 */

export class CgvUpstreamUnavailableError extends Error {
  constructor() {
    super('CGV 원본 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    this.name = 'CgvUpstreamUnavailableError';
  }
}

export function isCgvUpstreamUnavailableError(
  error: unknown,
): error is CgvUpstreamUnavailableError {
  return error instanceof CgvUpstreamUnavailableError;
}
