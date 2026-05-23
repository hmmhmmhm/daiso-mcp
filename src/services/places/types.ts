export type PlaceCategory = 'restaurant' | 'cafe' | 'food' | 'dessert' | 'all';

export interface NearbyPlace {
  name: string;
  category: string;
  address: string;
  roadAddress: string;
  phone: string;
  link?: string;
  longitude: number | null;
  latitude: number | null;
  raw: Record<string, unknown>;
}

export interface PlacesSearchResult {
  provider: 'naverLocal';
  searchMode: 'keyword';
  query: string;
  category: PlaceCategory;
  location: string;
  totalCount: number;
  count: number;
  places: NearbyPlace[];
}
