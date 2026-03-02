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
  priceToPay: number;
  originalPrice: number;
  discountRate: number;
  o2oStockFlag: boolean;
  o2oRemainQuantity: number;
}

interface OliveyoungApiData {
  totalCount?: number;
  nextPage?: boolean;
  storeList?: Array<{
    storeCode?: string;
    storeName?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    pickupYn?: boolean;
    o2oRemainQuantity?: number;
  }>;
  serachList?: Array<{
    goodsNumber?: string;
    goodsName?: string;
    priceToPay?: number;
    originalPrice?: number;
    discountRate?: number;
    o2oStockFlag?: boolean;
    o2oRemainQuantity?: number;
  }>;
  searchList?: Array<{
    goodsNumber?: string;
    goodsName?: string;
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
