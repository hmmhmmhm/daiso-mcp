/**
 * GS25 원본 서비스 장애 오류
 */

export class Gs25UpstreamUnavailableError extends Error {
  constructor() {
    super('GS25 재고 서비스 인증을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
    this.name = 'Gs25UpstreamUnavailableError';
  }
}

export function isGs25UpstreamUnavailableError(
  error: unknown,
): error is Gs25UpstreamUnavailableError {
  return error instanceof Gs25UpstreamUnavailableError;
}
