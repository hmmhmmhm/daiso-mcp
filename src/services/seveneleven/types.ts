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
