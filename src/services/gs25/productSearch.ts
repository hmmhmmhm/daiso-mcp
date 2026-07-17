/**
 * GS25 상품 검색 API
 */
/* c8 ignore start */

import { fetchJson, HttpError } from '../../utils/http.js';
import { decodeZyteHttpBody, requestByZyte } from '../../utils/zyte.js';
import { GS25_API } from './api.js';
import { toNumber } from './storeUtils.js';

interface RequestOptions {
  timeout?: number;
  zyteApiKey?: string;
}

interface Gs25TotalSearchDocument {
  field?: {
    itemCode?: string;
    itemName?: string;
    shortItemName?: string;
    itemImageUrl?: string;
    starPoint?: string;
    stockCheckYn?: string;
  };
}

interface Gs25TotalSearchResponse {
  SearchQueryResult?: {
    keywordInfo?: {
      keyword?: string;
      searchKeyword?: string;
    };
    Collection?: Array<{
      CollectionId?: string;
      Documentset?: {
        totalCount?: number;
        Document?: Gs25TotalSearchDocument[];
      };
    }>;
  };
}

export interface Gs25SearchProduct {
  itemCode: string;
  itemName: string;
  shortItemName: string;
  imageUrl: string;
  rating: number;
  stockCheckEnabled: boolean;
}

const GS25_TOTAL_SEARCH_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36',
  Origin: 'https://woodongs.com',
  Referer: 'https://woodongs.com/',
  'Content-Type': 'application/json',
} as const;

const GS25_DEFAULT_FETCH_OPTIONS = {
  retries: 1,
  retryDelayMs: 250,
} as const;

async function fetchGs25TotalSearchResponse(
  query: string,
  options: RequestOptions,
): Promise<Gs25TotalSearchResponse> {
  const { timeout = 20000 } = options;
  const endpoint = new URL(GS25_API.TOTAL_SEARCH_PATH, GS25_API.APIGW_BASE_URL);
  const bodyText = JSON.stringify({ query });

  try {
    return await fetchJson<Gs25TotalSearchResponse>(endpoint.toString(), {
      ...GS25_DEFAULT_FETCH_OPTIONS,
      method: 'POST',
      retryUnsafeMethods: true,
      timeout,
      headers: GS25_TOTAL_SEARCH_HEADERS,
      body: bodyText,
    });
  } catch (error) {
    const zyteApiKey = options.zyteApiKey?.trim();
    if (!(error instanceof HttpError) || error.status !== 403 || !zyteApiKey) {
      throw error;
    }

    const result = await requestByZyte({
      apiKey: zyteApiKey,
      url: endpoint.toString(),
      method: 'POST',
      timeout,
      retries: 1,
      headers: Object.entries(GS25_TOTAL_SEARCH_HEADERS).map(([name, value]) => ({
        name,
        value,
      })),
      bodyText,
      tags: { service: 'gs25' },
    });
    return decodeZyteHttpBody<Gs25TotalSearchResponse>(result);
  }
}

export async function fetchGs25NormalizedKeyword(
  keyword: string,
  options: RequestOptions = {},
): Promise<{ keyword: string; searchKeyword: string } | null> {
  const query = keyword.trim();
  if (query.length === 0) {
    return null;
  }

  const body = await fetchGs25TotalSearchResponse(query, options);

  const normalizedKeyword = body.SearchQueryResult?.keywordInfo?.keyword?.trim() || '';
  const normalizedSearchKeyword = body.SearchQueryResult?.keywordInfo?.searchKeyword?.trim() || '';
  if (normalizedKeyword.length === 0 && normalizedSearchKeyword.length === 0) {
    return null;
  }

  return {
    keyword: normalizedKeyword,
    searchKeyword: normalizedSearchKeyword,
  };
}

export async function fetchGs25SearchProducts(
  keyword: string,
  options: RequestOptions = {},
): Promise<Gs25SearchProduct[]> {
  const query = keyword.trim();
  if (query.length === 0) {
    return [];
  }

  const body = await fetchGs25TotalSearchResponse(query, options);
  const products: Gs25SearchProduct[] = [];
  const collections = body.SearchQueryResult?.Collection || [];

  for (const collection of collections) {
    const documents = collection.Documentset?.Document || [];
    for (const doc of documents) {
      const field = doc.field;
      if (!field?.itemCode) continue;

      products.push({
        itemCode: field.itemCode,
        itemName: field.itemName || '',
        shortItemName: field.shortItemName || '',
        imageUrl: field.itemImageUrl || '',
        rating: toNumber(field.starPoint),
        stockCheckEnabled: field.stockCheckYn === 'Y',
      });
    }
  }

  return products;
}

/* c8 ignore stop */
