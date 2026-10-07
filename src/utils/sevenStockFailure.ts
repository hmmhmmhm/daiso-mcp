/** 확인된 공개 오류만 전달해 임의 응답 본문과 인증 정보 노출을 막습니다. */
export const EXTERNAL_SERVICE_RETRY_HINT =
  '일시적인 외부 서비스 오류입니다. 잠시 후 재시도해주세요.';
export const SEVEN_STORE_REJECTION = '정상적인 점포 조회 요청이 아닙니다.';
export interface SevenStockFailure {
  status: 400;
  code: 501;
  message: typeof SEVEN_STORE_REJECTION;
}
export function parseSevenStockFailure(value: unknown): SevenStockFailure | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  if (data.status !== 400 || data.code !== 501 || data.message !== SEVEN_STORE_REJECTION)
    return undefined;
  return { status: 400, code: 501, message: SEVEN_STORE_REJECTION };
}
