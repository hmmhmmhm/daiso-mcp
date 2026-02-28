/**
 * 다이소 MCP 서버 타입 정의
 */

// 매장 옵션 정보
export interface StoreOptions {
  parking: boolean;
  ramp: boolean;
  elevator: boolean;
  cashless: boolean;
  photoSticker: boolean;
  nameSticker: boolean;
  simCard: boolean;
  taxFree: boolean;
  groupOrder: boolean;
  pickup: boolean;
}

// 매장 정보 (daiso.co.kr API)
export interface Store {
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  openTime: string;
  closeTime: string;
  openDate?: string;
  options: StoreOptions;
}

// 매장 재고 정보 (daisomall.co.kr API)
export interface StoreInventory {
  storeCode: string;
  storeName: string;
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
  lat: number;
  lng: number;
  distance: string;
  quantity: number;
  options: {
    parking: boolean;
    simCard: boolean;
    pickup: boolean;
    taxFree: boolean;
    elevator: boolean;
    ramp: boolean;
    cashless: boolean;
  };
}

// 상품 정보 (daisomall.co.kr API)
export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  imageUrl?: string;
  category?: string;
  brand?: string;
  soldOut?: boolean;
  isNew?: boolean;
  pickupAvailable?: boolean;
  onlineStock?: number;
}

// 상품 검색 응답
export interface ProductSearchResponse {
  resultSet: {
    result: Array<{
      totalSize: number;
      resultDocuments: Array<{
        PD_NO: string;
        PDNM: string;
        EXH_PD_NM?: string;
        PD_PRC: string;
        ATCH_FILE_URL?: string;
        BRND_NM?: string;
        SOLD_OUT_YN?: string;
        NEW_PD_YN?: string;
        PKUP_OR_PSBL_YN?: string;
        ONL_SCL_CD?: string;
      }>;
    }>;
  };
}

// 온라인 재고 응답
export interface OnlineStockResponse {
  data: {
    pdNo: string;
    stck: number;
  };
  success: boolean;
}

// 매장 재고 응답
export interface StoreInventoryResponse {
  data: {
    msStrVOList: Array<{
      strCd: string;
      strNm: string;
      strAddr: string;
      strTno: string;
      opngTime: string;
      clsngTime: string;
      strLttd: number;
      strLitd: number;
      km: string;
      qty: string;
      parkYn: string;
      usimYn: string;
      pkupYn: string;
      taxfYn: string;
      elvtYn?: string;
      entrRampYn?: string;
      nocashYn?: string;
    }>;
    intStrCont: number;
  };
  success: boolean;
}

// MCP 도구 응답 형식
export interface McpToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}
