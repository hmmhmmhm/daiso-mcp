/** 롯데마트 지원 종료 이후 기존 내부 함수도 외부 지도 API를 호출하지 않습니다. */
import type { RequestOptions } from './clientTypes.js';
export async function geocodeLotteMartAddress(
  _address: string,
  _options: RequestOptions = {},
): Promise<{ latitude: number; longitude: number } | null> {
  return null;
}
export function __testOnlyClearLotteMartGeocodeCache(): void {
  // 지원 종료 후에는 캐시나 외부 요청을 유지하지 않습니다.
}
