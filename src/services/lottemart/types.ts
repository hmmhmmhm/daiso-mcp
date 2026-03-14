/**
 * 롯데마트 타입 정의
 */

export type LotteMartBrandVariant =
  | 'lottemart'
  | 'toysrus'
  | 'max'
  | 'bottlebunker'
  | 'mealguru'
  | 'grandgrocery'
  | 'other';

export interface LotteMartMarketOption {
  area: string;
  storeCode: string;
  storeName: string;
  brandVariant: LotteMartBrandVariant;
}

export interface LotteMartStore {
  area: string;
  storeCode: string;
  storeName: string;
  brandVariant: LotteMartBrandVariant;
  address: string;
  phone: string;
  openTime: string;
  closedDays: string;
  parkingType: string;
  parkingDetails: string;
  detailUrl: string;
  latitude: number;
  longitude: number;
  distanceM: number | null;
}

export interface LotteMartProduct {
  area: string;
  storeCode: string;
  storeName: string;
  keyword: string;
  productName: string;
  barcode: string;
  spec: string;
  manufacturer: string;
  price: number;
  stockQuantity: number;
}
