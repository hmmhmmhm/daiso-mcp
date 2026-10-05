/**
 * 이마트24 서비스 전용 타입 정의
 */

export interface Emart24Store {
  storeCode: string;
  storeName: string;
  address: string;
  addressDetail: string;
  phone: string;
  latitude: number;
  longitude: number;
  openTime: string;
  closeTime: string;
  openDate: string;
  endDate: string;
  service24h: boolean;
  distanceM: number | null;
}

export interface Emart24Product {
  pluCd: string;
  goodsName: string;
  originPrice: number;
  viewPrice: number;
  category: string;
  kind: string;
}

export interface Emart24StoreInventory {
  bizNo: string;
  bizQty: number | null;
  storeName: string;
  address: string;
  phone: string;
  distanceM: number | null;
}

interface Emart24WebStoreRecord {
  CODE?: string;
  TITLE?: string;
  ADDRESS?: string;
  ADDRESS_DE?: string;
  PHONE?: string;
  LATITUDE?: number | string;
  LONGITUDE?: number | string;
  START_HHMM?: string;
  END_HHMM?: string;
  OPEN_DATE?: string;
  END_DATE?: string;
  SVR_24?: string | number;
}

export interface Emart24WebStoreResponse {
  error?: number;
  count?: number;
  data?: Emart24WebStoreRecord[];
}

interface Emart24ProductRecord {
  pluCd?: string;
  goodsNm?: string;
  originPrice?: number | string;
  viewPrice?: number | string;
  categoryNm?: string;
  kindNm?: string;
}

export interface Emart24ProductSearchResponse {
  totalCnt?: number | string;
  productList?: Emart24ProductRecord[];
}

interface Emart24StoreQtyRecord {
  BIZNO?: string;
  BIZQTY?: number | string;
}

interface Emart24GoodsInfoRecord {
  pluCd?: string;
  goodsNm?: string;
  viewPrice?: number | string;
}

export interface Emart24StockByStoreResponse {
  storeGoodsInfo?: Emart24GoodsInfoRecord;
  storeGoodsQty?: Emart24StoreQtyRecord[];
}

interface Emart24StoreDetailInfo {
  storeNm?: string;
  tel?: string;
  storeAddr?: string;
}

export interface Emart24StoreDetailResponse {
  storeInfo?: Emart24StoreDetailInfo;
}
