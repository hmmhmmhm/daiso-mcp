/** 실제 조회가 빠진 요약·빈 기본값을 운영 정상으로 판정하지 않습니다. */
import * as z from 'zod';
const text = z.string().trim().min(1);
const count = z.number().int().nonnegative();
const inventory = z.object({
  summary: z.object({ headline: text }),
  selectedProduct: z.object({ id: text, name: text }),
  storeInventory: z.object({
    inStockCount: count,
    outOfStockCount: count,
    unknownStockCount: count,
    stores: z
      .array(z.object({ storeCode: text, storeName: text, quantity: count.nullable() }))
      .min(1),
  }),
});
export function validateDaisoInventoryByName(payload: Record<string, unknown>): string | null {
  const parsed = inventory.safeParse(payload);
  if (!parsed.success) return '상품 ID/이름과 매장별 실제 재고 응답이 없습니다';
  const data = parsed.data.storeInventory;
  const positive = data.stores.filter((s) => s.quantity !== null && s.quantity > 0).length;
  const zero = data.stores.filter((s) => s.quantity === 0).length;
  const unknown = data.stores.filter((s) => s.quantity === null).length;
  return positive + zero > 0 &&
    positive === data.inStockCount &&
    zero === data.outOfStockCount &&
    unknown === data.unknownStockCount
    ? null
    : '재고 수량이 모두 미확인이거나 집계가 실제 매장 수량과 다릅니다';
}
const popwords = z.object({ available: z.boolean(), count, keywords: z.array(text) });
export function validateCatalogPopwords(payload: Record<string, unknown>): string | null {
  const parsed = popwords.safeParse(payload);
  if (!parsed.success) return '인기 검색어 응답 계약이 올바르지 않습니다';
  const data = parsed.data;
  return data.count === data.keywords.length && data.available === data.count > 0
    ? null
    : '인기 검색어 수와 제공 여부가 실제 목록과 다릅니다';
}
const section = z.object({ totalCount: count, items: z.array(z.record(z.string(), z.unknown())) });
const catalog = z.object({
  pages: section.extend({ items: z.array(z.object({ itemCode: text, itemName: text })).min(1) }),
  issues: section,
  exhibitions: section,
});
export function validateCatalogSnapshot(payload: Record<string, unknown>): string | null {
  return catalog.safeParse(payload).success ? null : '카탈로그 상품과 기획전 응답이 없습니다';
}
