/** 상품명이 정확히 일치하는 재고 후보를 우선 사용합니다. */
import type { CuStockItem } from './types.js';

export function selectCuStockItem(items: CuStockItem[], keyword: string): CuStockItem | null {
  const candidates = items.filter((item) => item.itemCode.trim().length > 0);
  const normalized = keyword.replace(/\s+/g, '').toLowerCase();
  return candidates.find((item) => item.itemName.replace(/\s+/g, '').toLowerCase() === normalized)
    ?? candidates[0] ?? null;
}

export function cuStockSelectionReason(item: CuStockItem | null, keyword: string): 'exact_match' | 'first_candidate' | null {
  if (!item) return null;
  return item.itemName.replace(/\s+/g, '').toLowerCase() === keyword.replace(/\s+/g, '').toLowerCase()
    ? 'exact_match' : 'first_candidate';
}
