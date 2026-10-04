/** 롯데마트 지원 종료 응답. 업스트림에는 요청하지 않습니다. */
import { type ApiContext, errorResponse } from './response.js';
export async function handleLotteMartFindStores(c: ApiContext) {
  return errorResponse(c, 'SERVICE_RETIRED', '롯데마트 서비스 지원이 종료되었습니다.', 410);
}
export const handleLotteMartSearchProducts = handleLotteMartFindStores;
export const handleLotteMartDebug = handleLotteMartFindStores;
