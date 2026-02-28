/**
 * 재고 확인 도구
 *
 * 다이소몰 API를 사용하여 매장별 재고를 확인합니다.
 * API: https://mapi.daisomall.co.kr/ms/msg/newIntSelStr
 */

import type {
  StoreInventory,
  StoreInventoryResponse,
  OnlineStockResponse,
  McpToolResponse,
} from '../types/index.js';
import { fetchJson } from '../utils/fetch.js';

interface CheckInventoryArgs {
  productId: string;
  storeQuery?: string;
  latitude?: number;
  longitude?: number;
  page?: number;
  pageSize?: number;
}

// 온라인 재고 조회
async function fetchOnlineStock(productNo: string): Promise<number> {
  const data = await fetchJson<OnlineStockResponse>(
    'https://mapi.daisomall.co.kr/ms/msg/selOnlStck',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdNo: productNo }),
    }
  );

  if (!data.success) {
    return 0;
  }

  return data.data?.stck || 0;
}

// 매장별 재고 조회
async function fetchStoreInventory(
  productNo: string,
  lat: number,
  lng: number,
  page: number = 1,
  pageSize: number = 30,
  keyword: string = ''
): Promise<{ stores: StoreInventory[]; totalCount: number }> {
  const data = await fetchJson<StoreInventoryResponse>(
    'https://mapi.daisomall.co.kr/ms/msg/newIntSelStr',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword,
        pdNo: productNo,
        curLttd: lat,
        curLitd: lng,
        geolocationAgrYn: 'Y',
        pkupYn: '',
        intCd: '',
        pageSize,
        currentPage: page,
      }),
    }
  );

  if (!data.success || !data.data?.msStrVOList) {
    return { stores: [], totalCount: 0 };
  }

  const stores: StoreInventory[] = data.data.msStrVOList.map((store) => ({
    storeCode: store.strCd,
    storeName: store.strNm,
    address: store.strAddr,
    phone: store.strTno,
    openTime: store.opngTime,
    closeTime: store.clsngTime,
    lat: store.strLttd,
    lng: store.strLitd,
    distance: store.km,
    quantity: parseInt(store.qty) || 0,
    options: {
      parking: store.parkYn === 'Y',
      simCard: store.usimYn === 'Y',
      pickup: store.pkupYn === 'Y',
      taxFree: store.taxfYn === 'Y',
      elevator: store.elvtYn === 'Y',
      ramp: store.entrRampYn === 'Y',
      cashless: store.nocashYn === 'Y',
    },
  }));

  return { stores, totalCount: data.data.intStrCont || stores.length };
}

export async function checkInventory(args: CheckInventoryArgs): Promise<McpToolResponse> {
  const {
    productId,
    storeQuery = '',
    latitude = 37.5665, // 기본값: 서울 시청
    longitude = 126.978,
    page = 1,
    pageSize = 30,
  } = args;

  if (!productId || productId.trim().length === 0) {
    throw new Error('상품 ID(productId)를 입력해주세요.');
  }

  // 온라인 재고와 매장 재고 동시 조회
  const [onlineStock, storeResult] = await Promise.all([
    fetchOnlineStock(productId),
    fetchStoreInventory(productId, latitude, longitude, page, pageSize, storeQuery),
  ]);

  // 재고 있는 매장과 없는 매장 분류
  const inStockStores = storeResult.stores.filter((s) => s.quantity > 0);
  const outOfStockStores = storeResult.stores.filter((s) => s.quantity === 0);

  const result = {
    productId,
    location: { latitude, longitude },
    onlineStock,
    storeInventory: {
      totalStores: storeResult.totalCount,
      inStockCount: inStockStores.length,
      outOfStockCount: outOfStockStores.length,
      page,
      pageSize,
      stores: storeResult.stores,
    },
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
