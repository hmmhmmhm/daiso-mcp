/**
 * CU 서비스 전용 타입 정의
 */

export interface CuStore {
  storeCode: string;
  storeName: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceM: number;
  stock: number;
  deliveryYn: boolean;
  pickupYn: boolean;
  reserveYn: boolean;
}

export interface CuStockItem {
  itemCode: string;
  onItemNo: string;
  itemName: string;
  price: number;
  pickupYn: boolean;
  deliveryYn: boolean;
  reserveYn: boolean;
}

interface CuStoreRecord {
  storeCd?: string;
  storeNm?: string;
  storeTelNo?: string | null;
  addrFst?: string | null;
  addrDetail?: string | null;
  doroStoreAddr1?: string | null;
  doroStoreAddr2?: string | null;
  latVal?: number | string;
  longVal?: number | string;
  distance?: number | string;
  stock?: number | string | null;
  deliveryYn?: string;
  deliveryPickYn?: string;
  jumpoPickYn?: string;
  reserveYn?: string;
}

export interface CuStoreResponse {
  totalCnt?: number;
  storeList?: CuStoreRecord[];
}

interface CuStockFields {
  item_cd?: string;
  on_item_no?: string;
  item_nm?: string;
  hyun_maega?: number | string;
  pickup_yn?: string;
  deliv_yn?: string;
  reserv_yn?: string;
}

interface CuStockRow {
  fields?: CuStockFields;
}

export interface CuStockMainResponse {
  spellModifyYn?: string;
  data?: {
    stockResult?: {
      result?: {
        total_count?: number | string;
        rows?: CuStockRow[];
      };
    };
  };
}
