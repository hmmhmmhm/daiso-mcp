/** 릴레이 원문과 자격증명을 보존하지 않는 안전한 오류 분류. */
import { ServiceError } from '../../core/errors.js';
import { HttpError, UnexpectedHtmlResponseError } from '../../utils/http.js';

export function toOliveyoungRelayError(error: unknown): ServiceError {
  if (error instanceof HttpError) {
    if (error.status === 429 && !error.quota) {
      try {
        const body = JSON.parse(error.bodyText);
        if (body?.code === 'OLIVEYOUNG_UPSTREAM_RATE_LIMITED' && body.upstreamStatus === 429 &&
            Number.isInteger(body.retryAfter) && body.retryAfter >= 1 && body.retryAfter <= 86400) {
          return new ServiceError('OLIVEYOUNG_UPSTREAM_RATE_LIMITED', '올리브영 원본 요청 제한',
            429, true, 429, undefined, undefined, body.retryAfter);
        }
      } catch { /* 안전한 원본 제한 계약만 분류합니다. */ }
    }
    return new ServiceError(
      'OLIVEYOUNG_RELAY_HTTP_ERROR',
      `올리브영 릴레이 요청 실패 (HTTP ${error.status})`,
      [429, 502, 503].includes(error.status) ? error.status as 429 | 502 | 503 : 502,
      error.status >= 500 || error.status === 408 || error.status === 429,
      error.status,
      error.quota,
    );
  }
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
    return new ServiceError('OLIVEYOUNG_RELAY_TIMEOUT', '올리브영 릴레이 요청 시간 초과', 504, true);
  }
  if (error instanceof SyntaxError || error instanceof UnexpectedHtmlResponseError) {
    return new ServiceError('OLIVEYOUNG_RELAY_INVALID_RESPONSE', '올리브영 릴레이 응답 형식 오류', 502, false);
  }
  return new ServiceError('OLIVEYOUNG_RELAY_NETWORK_ERROR', '올리브영 릴레이 네트워크 요청 실패', 502, true);
}
