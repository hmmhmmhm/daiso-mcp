export type CompareServiceId = 'daiso' | 'gs25' | 'seveneleven' | 'emart24';

export interface ComparableProduct {
  service: CompareServiceId;
  serviceName: string;
  code: string | null;
  name: string;
  price: number | null;
  originalPrice?: number | null;
  imageUrl?: string;
  stockCheckEnabled?: boolean;
  raw: unknown;
}

export interface CompareProductsResult {
  keyword: string;
  services: CompareServiceId[];
  serviceCount: number;
  resultCount: number;
  bestPrice: ComparableProduct | null;
  results: ComparableProduct[];
  errors: Array<{
    service: CompareServiceId;
    message: string;
  }>;
  note: string;
}
