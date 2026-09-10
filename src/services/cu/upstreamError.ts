/** CU 재고 조회 불가 사유를 응답 형식과 전송 실패에 따라 구분합니다. */
import { HttpError, UnexpectedHtmlResponseError } from '../../utils/http.js';

export function cuStockUnavailableReason(error: unknown): string | null {
  if (error instanceof UnexpectedHtmlResponseError) {
    return 'CU 재고 API가 JSON 대신 HTML을 반환하여 재고를 확인할 수 없습니다.';
  }
  if (error instanceof HttpError && [400, 403, 429].includes(error.status)) {
    return `CU 재고 API가 차단되었습니다 (${error.status} Request Blocked).`;
  }
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Zyte API 호출 실패: 520') || message.includes('Zyte 대상 응답 실패: 520')) {
    return 'CU 재고 API가 차단되었습니다 (Zyte Website Ban 520).';
  }
  return null;
}
