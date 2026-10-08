/** 점포별 재고를 순서대로 조회하여 중계 쿼터 오류 뒤 추가 호출을 막습니다. */
import type { SevenElevenStockError, SevenElevenStockStore, SevenElevenStore } from './types.js';

export interface StockApiAttemptResult {
  stores: SevenElevenStockStore[] | null;
  error: SevenElevenStockError | null;
}

export async function requestStockStoresIndividually(
  stores: SevenElevenStore[],
  request: (store: SevenElevenStore) => Promise<StockApiAttemptResult>,
): Promise<StockApiAttemptResult> {
  const stockStores: SevenElevenStockStore[] = [];
  let error: SevenElevenStockError | null = null;
  for (const store of stores) {
    // 오류를 던지는 중계 전송은 즉시 중단하고 일반 API 오류는 결과에 보존합니다.
    const result = await request(store);
    if (result.stores) stockStores.push(...result.stores);
    if (result.error?.httpStatus === 429) return { stores: stockStores, error: result.error };
    if (!error && result.error) error = result.error;
  }
  return { stores: stockStores, error };
}
