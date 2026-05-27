export type OpinetFuelCode = 'B027' | 'D047' | 'B034' | 'C004' | 'K015';

export type OpinetSort = 'price' | 'distance';

export interface OpinetAveragePrice {
  tradeDate: string;
  productCode: string;
  productName: string;
  price: number | null;
  diff: string;
  raw: Record<string, unknown>;
}

export interface OpinetStationSummary {
  stationId: string;
  brandCode: string;
  brandName: string;
  name: string;
  price: number | null;
  distanceMeters?: number | null;
  address?: string;
  roadAddress?: string;
  katecX?: number | null;
  katecY?: number | null;
  raw: Record<string, unknown>;
}

export interface OpinetStationDetail extends OpinetStationSummary {
  phone?: string;
  areaCode?: string;
  lpgType?: string;
  hasMaintenance?: boolean;
  hasCarWash?: boolean;
  hasConvenienceStore?: boolean;
  isKpetroCertified?: boolean;
  prices: Array<{
    productCode: string;
    price: number | null;
    tradeDate: string;
    tradeTime: string;
    raw: Record<string, unknown>;
  }>;
}

export interface OpinetAveragePricesResult {
  provider: 'opinet';
  source: '한국석유공사 오피넷';
  fetchedAt: string;
  count: number;
  prices: OpinetAveragePrice[];
}

export interface OpinetLowestStationsResult {
  provider: 'opinet';
  source: '한국석유공사 오피넷';
  fetchedAt: string;
  fuelCode: OpinetFuelCode;
  areaCode: string | null;
  count: number;
  stations: OpinetStationSummary[];
}

export interface OpinetAroundStationsResult {
  provider: 'opinet';
  source: '한국석유공사 오피넷';
  fetchedAt: string;
  fuelCode: OpinetFuelCode;
  radiusMeters: number;
  sort: OpinetSort;
  katec: {
    x: number;
    y: number;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    location: string | null;
    formattedAddress: string | null;
    geocodeUsed: boolean;
    inputType: 'katec' | 'coordinates' | 'location';
  };
  count: number;
  stations: OpinetStationSummary[];
}

export interface OpinetStationDetailResult {
  provider: 'opinet';
  source: '한국석유공사 오피넷';
  fetchedAt: string;
  station: OpinetStationDetail | null;
}
