/**
 * 선택 매장의 검증된 재고와 채널 표시
 */
import { isRecord, toText } from '../utils/cliInteractiveHelpers.js';
import type { InteractiveStore, WriteFn } from './interactiveTypes.js';

export function matchSelectedStore(stores: unknown, store: InteractiveStore): Record<string, unknown> | undefined {
  if (!Array.isArray(stores)) return undefined;
  const entries = stores.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  const codeMatches = store.storeCode
    ? entries.filter((entry) => toText(entry.storeCode) === store.storeCode)
    : [];
  if (codeMatches.length === 1) return codeMatches[0];
  if (codeMatches.length > 1) return undefined;
  const matches = entries.filter((entry) => {
    if (store.storeCode && toText(entry.storeCode)) return false;
    return store.address.length > 0 && toText(entry.address) === store.address
      && (toText(entry.storeName) || toText(entry.name)) === store.name;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function quantityText(value: unknown): string {
  const quantity = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isInteger(quantity) && quantity >= 0 ? String(quantity) : '확인 불가';
}

export function oliveyoungStoreStock(product: unknown, store: InteractiveStore): Record<string, unknown> | undefined {
  if (!isRecord(product) || !isRecord(product.storeInventory)) return undefined;
  return matchSelectedStore(product.storeInventory.stores, store);
}

export function printOliveyoungStock(writeOut: WriteFn, match: Record<string, unknown> | undefined): void {
  const status = match?.stockStatus;
  const label = status === 'in_stock' ? '재고 있음' : status === 'out_of_stock' ? '품절'
    : status === 'not_sold' ? '미취급' : '확인 불가';
  writeOut(`- 남은수량: ${quantityText(match?.remainQuantity)}`);
  writeOut(`- O2O 남은수량: ${quantityText(match?.o2oRemainQuantity)}`);
  writeOut(`- 재고 상태: ${label}`);
}

export function cuStoreStock(payload: unknown, itemCode: string, store: InteractiveStore): Record<string, unknown> | undefined {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return undefined;
  const nearby = payload.data.nearbyStores;
  if (!isRecord(nearby) || nearby.available === false || !itemCode || nearby.stockItemCode !== itemCode) return undefined;
  return matchSelectedStore(nearby.stores, store);
}

export function printCuStock(writeOut: WriteFn, match: Record<string, unknown> | undefined): void {
  writeOut(`- 재고 수량: ${quantityText(match?.stock)}`);
  const hasVerifiedStock = quantityText(match?.stock) !== '확인 불가';
  for (const [field, label] of [['pickupYn', '픽업'], ['deliveryYn', '배달'], ['reserveYn', '예약']]) {
    const value = hasVerifiedStock ? match?.[field] : undefined;
    writeOut(`- ${label} 가능: ${value === true ? '예' : value === false ? '아니오' : '확인 불가'}`);
  }
}
