/**
 * GS25 원본 서비스 장애 오류
 */

export class Gs25UpstreamUnavailableError extends Error {
  constructor() {
    super('GS25 재고 서비스 인증을 사용할 수 없습니다. 운영자는 GS25_AUTH_SESSION_FILE의 인증 갱신 상태를 확인하세요. API 키 방식은 GS25_API_KEY 설정을 확인하세요.');
    this.name = 'Gs25UpstreamUnavailableError';
  }
}

export function isGs25UpstreamUnavailableError(
  error: unknown,
): error is Gs25UpstreamUnavailableError {
  return error instanceof Gs25UpstreamUnavailableError;
}
