/**
 * 올리브영 응답 정규화 유틸리티
 */

import type { OliveyoungApiResponse, OliveyoungStockStore } from './types.js';

const OLIVEYOUNG_IMAGE_HOST = 'https://image.oliveyoung.co.kr';
const OLIVEYOUNG_IMAGE_PATH_PREFIX = '/uploads/images/goods';

export function resolveOliveyoungInStock(o2oStockFlag: boolean, o2oRemainQuantity: number): boolean {
  return o2oStockFlag || o2oRemainQuantity > 0;
}

export function resolveOliveyoungImageUrl(imagePath?: string): string | undefined {
  if (!imagePath) {
    return undefined;
  }

  if (/^https?:\/\//i.test(imagePath)) {
    return imagePath;
  }

  if (imagePath.startsWith('//')) {
    return `https:${imagePath}`;
  }

  const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;

  if (normalizedPath.startsWith(`${OLIVEYOUNG_IMAGE_PATH_PREFIX}/`)) {
    return `${OLIVEYOUNG_IMAGE_HOST}${normalizedPath}`;
  }

  return `${OLIVEYOUNG_IMAGE_HOST}${OLIVEYOUNG_IMAGE_PATH_PREFIX}${normalizedPath}`;
}

function resolveOliveyoungStoreQuantity(remainQuantity: number, o2oRemainQuantity: number): number {
  return Math.max(remainQuantity, o2oRemainQuantity);
}

export function resolveOliveyoungStoreStock(
  rawStore: OliveyoungApiResponse['data'] extends infer T
    ? T extends { storeList?: Array<infer U> }
      ? U
      : never
    : never,
): OliveyoungStockStore {
  const remainQuantity = rawStore?.remainQuantity || 0;
  const o2oRemainQuantity = rawStore?.o2oRemainQuantity || 0;
  const quantity = resolveOliveyoungStoreQuantity(remainQuantity, o2oRemainQuantity);
  const salesStoreYn = Boolean(rawStore?.salesStoreYn);

  let stockStatus: OliveyoungStockStore['stockStatus'] = 'out_of_stock';
  let stockLabel = '품절';

  if (!salesStoreYn) {
    stockStatus = 'not_sold';
    stockLabel = '미판매';
  } else if (quantity > 0) {
    stockStatus = 'in_stock';
    stockLabel = quantity >= 9 ? '재고 9개 이상' : `재고 ${quantity}개`;
  }

  return {
    storeCode: rawStore?.storeCode || '',
    storeName: rawStore?.storeName || '',
    address: rawStore?.address || '',
    latitude: rawStore?.latitude || 0,
    longitude: rawStore?.longitude || 0,
    distance: rawStore?.distance || 0,
    pickupYn: Boolean(rawStore?.pickupYn),
    salesStoreYn,
    remainQuantity,
    o2oRemainQuantity,
    stockStatus,
    stockLabel,
    openYn: Boolean(rawStore?.openYn),
  };
}
