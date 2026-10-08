/** 상품 목록과 실제 매장 재고 확인을 구분하고 공개 할당량 진단만 보존합니다. */
import type { HealthCheckResult } from './healthCheckTypes.js';

interface FailureBody {
  error?: { code?: string };
  diagnostics?: { upstreamStatus?: number; quotaReason?: unknown; retryAfter?: unknown };
}

export function healthFailureDiagnostics(body: FailureBody): Partial<HealthCheckResult> {
  const result: Partial<HealthCheckResult> = {};
  if (body.error?.code) result.errorCode = body.error.code;
  const diagnostics = body.diagnostics;
  if (!diagnostics) return result;
  if (typeof diagnostics.upstreamStatus === 'number') result.upstreamStatus = diagnostics.upstreamStatus;
  const reason = diagnostics.quotaReason;
  const retry = diagnostics.retryAfter;
  if (reason === 'minute' || reason === 'daily' || reason === 'consumer' || reason === 'consumer-busy') {
    result.quotaReason = reason;
    if (typeof retry === 'number' && Number.isInteger(retry) && retry > 0 && retry <= 86400) result.retryAfter = retry;
  }
  return result;
}

export function hasCheckedStoreStock(id: string, data: unknown): boolean {
  if (!['cu.inventory', 'oliveyoung.inventory', 'gs25.inventory', 'seveneleven.inventory'].includes(id)) return true;
  if (!data || typeof data !== 'object') return false;
  const record = data as {
    nearbyStores?: { stores?: Array<{ stock?: unknown }> };
    inventory?: { stockCheckedCount?: number; products?: Array<{ stockSource?: unknown; storeInventory?: { stores?: Array<{ stockStatus?: unknown }> } }>; stores?: Array<{ realStockQuantity?: unknown; stockQuantity?: unknown }> };
  };
  if (id === 'oliveyoung.inventory') return (record.inventory?.stockCheckedCount ?? 0) > 0 && (record.inventory?.products?.some(product => product.stockSource === 'nearby_store' && (product.storeInventory?.stores?.some(store => ['in_stock', 'out_of_stock', 'not_sold'].includes(String(store.stockStatus))) ?? false)) ?? false);
  if (id === 'gs25.inventory') return record.inventory?.stores?.some(store => knownStock(store.realStockQuantity)) ?? false;
  if (id === 'seveneleven.inventory') return record.inventory?.stores?.some(store => knownStock(store.stockQuantity)) ?? false;
  return record.nearbyStores?.stores?.some(store => knownStock(store.stock)) ?? false;
}

function knownStock(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
