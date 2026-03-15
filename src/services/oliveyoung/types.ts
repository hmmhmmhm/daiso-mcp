/**
 * 올리브영 서비스 전용 타입 정의
 */

export interface OliveyoungStore {
  storeCode: string;
  storeName: string;
  address: string;
  latitude: number;
  longitude: number;
  pickupYn: boolean;
  o2oRemainQuantity: number;
}

export interface OliveyoungProduct {
  goodsNumber: string;
  goodsName: string;
  imageUrl?: string;
  priceToPay: number;
  originalPrice: number;
  discountRate: number;
  o2oStockFlag: boolean;
  o2oRemainQuantity: number;
  inStock: boolean;
  stockStatus: 'in_stock' | 'out_of_stock';
  stockSource?: 'global_search' | 'nearby_store';
  storeInventory?: OliveyoungProductStoreInventory;
}

export interface OliveyoungStockStore {
  storeCode: string;
  storeName: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: number;
  pickupYn: boolean;
  salesStoreYn: boolean;
  remainQuantity: number;
  o2oRemainQuantity: number;
  stockStatus: 'in_stock' | 'out_of_stock' | 'not_sold';
  stockLabel: string;
  openYn: boolean;
}

export interface OliveyoungProductStoreInventory {
  totalCount: number;
  inStockCount: number;
  outOfStockCount: number;
  notSoldCount: number;
  stores: OliveyoungStockStore[];
}

interface OliveyoungApiData {
  totalCount?: number;
  nextPage?: boolean;
  goodsInfo?: {
    masterGoodsNumber?: string;
  };
  storeList?: Array<{
    storeCode?: string;
    storeName?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    distance?: number;
    pickupYn?: boolean;
    salesStoreYn?: boolean;
    remainQuantity?: number;
    o2oRemainQuantity?: number;
    openYn?: boolean;
  }>;
  serachList?: Array<{
    goodsNumber?: string;
    goodsName?: string;
    imagePath?: string;
    priceToPay?: number;
    originalPrice?: number;
    discountRate?: number;
    o2oStockFlag?: boolean;
    o2oRemainQuantity?: number;
  }>;
  searchList?: Array<{
    goodsNumber?: string;
    goodsName?: string;
    imagePath?: string;
    priceToPay?: number;
    originalPrice?: number;
    discountRate?: number;
    o2oStockFlag?: boolean;
    o2oRemainQuantity?: number;
  }>;
}

export interface OliveyoungApiResponse {
  status?: string;
  data?: OliveyoungApiData;
}

export interface ZyteExtractResponse {
  statusCode?: number;
  httpResponseBody?: string;
  detail?: string;
  title?: string;
  type?: string;
}
