import type { Gs25SearchProduct } from './productSearch.js';

// GS 검색의 첫 항목이 다른 용량/제로 제품일 수 있어 정확한 상품명을 먼저 선택한다.
export function selectGs25InventoryProduct(
  products: Gs25SearchProduct[],
  keyword: string,
): Gs25SearchProduct | undefined {
  const normalize = (name: string) => name.replace(/\s+/g, '').toLowerCase();
  const query = normalize(keyword);
  const valid = products.filter((product) => product.itemCode.length > 0);
  return valid.find((product) => normalize(product.itemName) === query)
    ?? valid.find((product) => normalize(product.shortItemName) === query)
    ?? valid[0];
}
