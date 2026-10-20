export interface JapanProduct {
  country: 'JP';
  id: string;
  name: string;
  price: number | null;
  currency: 'JPY';
  url: string;
  onlineAvailable: boolean | null;
  storeInventorySupported: false;
  imageUrl?: string;
  note?: string;
}

export interface JapanStore {
  id: string;
  name: string;
  address: string;
  hours: string;
  url: string;
  latitude: number | null;
  longitude: number | null;
  brand: string;
}

export interface JapanProductSearchResult {
  country: 'JP';
  currency: 'JPY';
  query: string;
  page: number;
  products: JapanProduct[];
  hasNext: boolean;
  note: string;
}

export interface JapanStoreSearchResult {
  country: 'JP';
  keyword: string;
  page: number;
  stores: JapanStore[];
  hasNext: boolean;
  note: string;
}
