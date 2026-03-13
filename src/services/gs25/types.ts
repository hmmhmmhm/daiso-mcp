/**
 * GS25 서비스 전용 타입 정의
 */

export interface Gs25StoreProperty {
  code: string;
  name: string;
  type: string;
  imageUrl: string;
}

export interface Gs25Store {
  storeCode: string;
  storeName: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  serviceCode: string;
  realStockQuantity: number;
  pickupStockQuantity: number;
  deliveryStockQuantity: number;
  isSoldOut: boolean;
  searchItemName: string;
  searchItemSellPrice: number | null;
  propertyNames: string[];
  properties: Gs25StoreProperty[];
  distanceM: number | null;
}

interface Gs25RawStoreProperty {
  storePropertyCode?: string;
  storePropertyName?: string;
  storePropertyType?: string;
  storePropertyImage?: string;
}

interface Gs25RawStore {
  storeCode?: string;
  storeName?: string;
  storeAddress?: string;
  storeTelephoneNumber?: string;
  storeXCoordination?: string | number;
  storeYCoordination?: string | number;
  serviceCode?: string;
  realStockQuantity?: string | number;
  pickupStkQty?: string | number;
  dlvyStkQty?: string | number;
  isSoldOutYn?: string | null;
  searchItemName?: string | null;
  searchItemSellPrice?: string | number | null;
  propertyList?: Gs25RawStoreProperty[];
}

export interface Gs25StoreStockResponse {
  stores?: Gs25RawStore[];
}

export interface Gs25ProductCandidate {
  name: string;
  sellPrice: number | null;
  matchedStoreCount: number;
  inStockStoreCount: number;
  totalStockQuantity: number;
}
