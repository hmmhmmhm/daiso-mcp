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

const storeIdentity = z.object({ storeCode: text, storeName: text });
const gs25Inventory = z.object({
  itemCode: text,
  inventory: z.object({
    count: count.positive(),
    stores: z.array(storeIdentity.extend({ realStockQuantity: count })).min(1),
  }),
});
const sevenInventory = z.object({
  product: z.object({ itemCode: text, itemName: text }),
  stockAvailable: z.literal(true),
  inventory: z.object({
    count: count.positive(),
    stores: z.array(storeIdentity.extend({ stockQuantity: count })).min(1),
  }),
});
const emartInventory = z.object({
  pluCd: text,
  inventory: z.object({
    count: count.positive(),
    stores: z.array(z.object({ bizNo: text, storeName: text, bizQty: count })).min(1),
  }),
});
const cuInventory = z.object({
  inventory: z.object({
    available: z.literal(true),
    items: z.array(z.object({ itemCode: text, itemName: text })).min(1),
  }),
  nearbyStores: z.object({
    available: z.literal(true),
    stockItemCode: text,
    stockItemName: text,
    count: count.positive(),
    stores: z.array(storeIdentity.extend({ stock: count })).min(1),
  }),
});
const oliveyoungInventory = z.object({
  inventory: z.object({
    stockCheckedCount: count.positive(),
    products: z
      .array(
        z.object({
          goodsNumber: text,
          goodsName: text,
          stockSource: z.literal('nearby_store'),
          stockStatus: z.enum(['in_stock', 'out_of_stock', 'not_sold']),
          storeInventory: z.object({
            stores: z
              .array(
                storeIdentity.extend({
                  remainQuantity: count.nullish(),
                  o2oRemainQuantity: count.nullish(),
                  stockStatus: z.enum(['in_stock', 'out_of_stock', 'not_sold', 'unknown']),
                }),
              )
              .min(1)
              .refine((stores) =>
                stores.some(
                  (store) =>
                    store.stockStatus !== 'unknown' &&
                    (typeof store.remainQuantity === 'number' ||
                      typeof store.o2oRemainQuantity === 'number'),
                ),
              ),
          }),
        }),
      )
      .min(1),
  }),
});
const retailSchemas = {
  gs25: gs25Inventory,
  seveneleven: sevenInventory,
  emart24: emartInventory,
  cu: cuInventory,
  oliveyoung: oliveyoungInventory,
};
export function validateRetailInventory(
  service: keyof typeof retailSchemas,
  payload: Record<string, unknown>,
): string | null {
  const parsed = retailSchemas[service].safeParse(payload);
  if (!parsed.success) return '상품 코드와 매장별 실제 재고 수량이 없습니다';
  if ('nearbyStores' in parsed.data) {
    const data = parsed.data;
    return data.nearbyStores.count === data.nearbyStores.stores.length &&
      data.inventory.items.some((item) => item.itemCode === data.nearbyStores.stockItemCode)
      ? null
      : 'CU 선택 상품 또는 매장 수가 실제 재고와 다릅니다';
  }
  const inventory = parsed.data.inventory;
  if ('products' in inventory) {
    return inventory.stockCheckedCount === inventory.products.length
      ? null
      : '올리브영 실제 재고 조회 상품 수가 다릅니다';
  }
  return inventory.count === inventory.stores.length ? null : '실제 재고 매장 수가 다릅니다';
}

export function validateCinemaCollection(
  payload: Record<string, unknown>,
  service: 'megabox' | 'lottecinema' | 'cgv' | 'dtryx',
): string | null {
  const schema =
    service === 'dtryx'
      ? z.object({ movies: z.array(z.object({ movieCode: text, movieName: text })).min(1) })
      : z.object({
          theaters: z
            .array(
              z.object({
                [service === 'cgv' ? 'theaterCode' : 'theaterId']: text,
                theaterName: text,
              }),
            )
            .min(1),
        });
  return schema.safeParse(payload).success ? null : '실제 극장 또는 상영작 목록이 없습니다';
}
