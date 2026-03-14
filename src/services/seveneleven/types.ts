/**
 * 세븐일레븐 타입 정의
 */

export interface SevenElevenApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  code?: number;
}

export interface SevenElevenRawProduct {
  prdNo?: string;
  itemCd?: string;
  itemOnm?: string;
  onlinePrice?: number;
  onlineCost?: number;
  repImgUrl?: string;
  eventGbnNm?: string;
  itemGbnNm?: string;
  avgEvalScore?: number;
  productReviewCnt?: number;
  makerNm?: string;
  [key: string]: unknown;
}

export interface SevenElevenProduct {
  productNo: string;
  itemCode: string;
  itemName: string;
  salePrice: number;
  originalPrice: number;
  imageUrl: string;
  eventName: string;
  itemType: string;
  makerName: string;
  reviewScore: number | null;
  reviewCount: number;
}

export interface SevenElevenSearchResult {
  query: string;
  totalCount: number;
  products: SevenElevenProduct[];
  collectionIds: string[];
}

export interface SevenElevenCatalogSnapshot {
  pages: SevenElevenProduct[];
  issues: SevenElevenProduct[];
  exhibitions: Array<{
    exhibitionIdx: number;
    exhibitionName: string;
    startDate: string;
    endDate: string;
    productCount: number;
  }>;
}

export interface SevenElevenStore {
  storeCode: string;
  storeName: string;
  address: string;
  latitude: number;
  longitude: number;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  closeYn: string;
}

export interface SevenElevenStoreSearchResult {
  query: string;
  totalCount: number;
  stores: SevenElevenStore[];
}

export interface SevenElevenStockStore {
  storeCode: string;
  storeName: string;
  address: string;
  latitude: number;
  longitude: number;
  stockQuantity: number;
  isSoldOut: boolean;
  distanceM: number | null;
}

export interface SevenElevenStockError {
  cause: 'api' | 'network' | 'unknown';
  httpStatus: number | null;
  code: number | null;
  message: string;
  raw: string | null;
}

export interface SevenElevenStockProductMeta {
  productNo: string;
  itemCode: string;
  itemName: string;
  smCode: string;
  stockManagementCode: string;
  stockManagementQuantity: number;
  stockApplicationRate: string;
}

export interface SevenElevenStockResult {
  productKeyword: string;
  product: {
    itemCode: string;
    itemName: string;
    salePrice: number;
    imageUrl: string;
  } | null;
  stockAvailable: boolean;
  stockError: SevenElevenStockError | null;
  totalStoreCount: number;
  inStockStoreCount: number;
  stores: SevenElevenStockStore[];
}
