/**
 * 세븐일레븐 API 클라이언트
 */

import { fetchJson } from '../../utils/http.js';
import { SEVENELEVEN_API } from './api.js';
import type {
  SevenElevenApiEnvelope,
  SevenElevenCatalogSnapshot,
  SevenElevenProduct,
  SevenElevenRawProduct,
  SevenElevenSearchResult,
} from './types.js';

interface RequestOptions {
  timeout?: number;
}

interface SearchProductsParams {
  query: string;
  page?: number;
  size?: number;
  sort?: string;
}

interface SearchQueryCollection {
  CollectionId?: string;
  Documentset?: {
    totalCount?: number;
    Document?: unknown[];
  };
}

interface SearchGoodsData {
  SearchQueryResult?: {
    query?: string;
    Collection?: SearchQueryCollection[];
  };
  content?: unknown[];
}

const SEVENELEVEN_DEFAULT_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 15)',
} as const;

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toRawProduct(input: unknown): SevenElevenRawProduct {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const record = input as Record<string, unknown>;
  if (record.field && typeof record.field === 'object') {
    return record.field as SevenElevenRawProduct;
  }

  return record as SevenElevenRawProduct;
}

function normalizeProduct(raw: SevenElevenRawProduct): SevenElevenProduct {
  return {
    productNo: toStringValue(raw.prdNo),
    itemCode: toStringValue(raw.itemCd),
    itemName: toStringValue(raw.itemOnm),
    salePrice: toNumber(raw.onlinePrice),
    originalPrice: toNumber(raw.onlineCost),
    imageUrl: toStringValue(raw.repImgUrl),
    eventName: toStringValue(raw.eventGbnNm),
    itemType: toStringValue(raw.itemGbnNm),
    makerName: toStringValue(raw.makerNm),
    reviewScore: raw.avgEvalScore === undefined ? null : toNumber(raw.avgEvalScore),
    reviewCount: toNumber(raw.productReviewCnt),
  };
}

function normalizeProducts(items: unknown[]): SevenElevenProduct[] {
  return items
    .map(toRawProduct)
    .map(normalizeProduct)
    .filter((item) => item.itemCode.length > 0 || item.itemName.length > 0);
}

async function requestSevenElevenJson<T>(
  path: string,
  method: 'GET' | 'POST',
  body: unknown,
  options: RequestOptions = {},
): Promise<SevenElevenApiEnvelope<T>> {
  const { timeout = 15000 } = options;
  const url = `${SEVENELEVEN_API.BASE_URL}${path}`;

  return fetchJson<SevenElevenApiEnvelope<T>>(url, {
    method,
    timeout,
    headers: SEVENELEVEN_DEFAULT_HEADERS,
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  });
}

export async function searchSevenElevenProducts(
  params: SearchProductsParams,
  options: RequestOptions = {},
): Promise<SevenElevenSearchResult> {
  const { query, page = 1, size = 20, sort = 'recommend' } = params;

  const response = await requestSevenElevenJson<SearchGoodsData>(
    SEVENELEVEN_API.SEARCH_GOODS_PATH,
    'POST',
    {
      query,
      page,
      size,
      sort,
    },
    options,
  );

  const data = response.data || {};
  const queryResult = data.SearchQueryResult;
  const collections = queryResult?.Collection || [];
  const collectionIds = collections.map((item) => item.CollectionId || '').filter((id) => id.length > 0);

  let totalCount = 0;
  const allDocuments: unknown[] = [];
  for (const collection of collections) {
    totalCount += toNumber(collection.Documentset?.totalCount);
    allDocuments.push(...(collection.Documentset?.Document || []));
  }

  const collectionProducts = normalizeProducts(allDocuments);
  const contentProducts = normalizeProducts(Array.isArray(data.content) ? data.content : []);
  const products = collectionProducts.length > 0 ? collectionProducts : contentProducts;

  return {
    query: queryResult?.query || query,
    totalCount,
    products,
    collectionIds,
  };
}

export async function fetchSevenElevenSearchPopwords(
  label = 'home',
  options: RequestOptions = {},
): Promise<string[]> {
  const encodedLabel = encodeURIComponent(label);
  const response = await requestSevenElevenJson<unknown>(
    `${SEVENELEVEN_API.SEARCH_POPWORD_PATH}?label=${encodedLabel}`,
    'POST',
    {},
    options,
  );

  const { data } = response;
  if (Array.isArray(data)) {
    return data.map((item) => toStringValue(item)).filter((item) => item.length > 0);
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  const record = data as Record<string, unknown>;
  const candidates = [record.keywords, record.popwords, record.wordList, record.list];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const values = candidate
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          const value = item as Record<string, unknown>;
          return toStringValue(value.keyword || value.word || value.text || value.name);
        }

        return '';
      })
      .filter((item) => item.length > 0);

    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

function normalizeExhibitions(items: unknown[]): SevenElevenCatalogSnapshot['exhibitions'] {
  return items
    .map((item) => {
      const value = (item || {}) as Record<string, unknown>;
      const productList = Array.isArray(value.exhibitionProductList) ? value.exhibitionProductList : [];

      return {
        exhibitionIdx: toNumber(value.exhibitionIdx),
        exhibitionName: toStringValue(value.exhibitionName),
        startDate: toStringValue(value.exhibitionStartDate),
        endDate: toStringValue(value.exhibitionEndDate),
        productCount: productList.length,
      };
    })
    .filter((item) => item.exhibitionIdx > 0 || item.exhibitionName.length > 0);
}

function extractContentArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  const record = data as Record<string, unknown>;
  if (Array.isArray(record.content)) {
    return record.content;
  }

  if (Array.isArray(record.list)) {
    return record.list;
  }

  return [];
}

export async function fetchSevenElevenCatalogSnapshot(
  options: {
    includeIssues?: boolean;
    includeExhibition?: boolean;
    timeout?: number;
  } = {},
): Promise<SevenElevenCatalogSnapshot> {
  const { includeIssues = true, includeExhibition = true, timeout = 15000 } = options;

  const tasks: Array<Promise<SevenElevenApiEnvelope<unknown>>> = [
    requestSevenElevenJson<unknown>(SEVENELEVEN_API.PRODUCT_PAGES_PATH, 'GET', null, { timeout }),
    includeIssues
      ? requestSevenElevenJson<unknown>(SEVENELEVEN_API.PRODUCT_ISSUES_PATH, 'GET', null, { timeout })
      : Promise.resolve({ data: { content: [] } }),
    includeExhibition
      ? requestSevenElevenJson<unknown>(SEVENELEVEN_API.EXHIBITION_MAIN_PATH, 'GET', null, { timeout })
      : Promise.resolve({ data: [] }),
  ];

  const [pagesResult, issuesResult, exhibitionsResult] = await Promise.allSettled(tasks);

  const pagesData = pagesResult.status === 'fulfilled' ? pagesResult.value.data : [];
  const issuesData = issuesResult.status === 'fulfilled' ? issuesResult.value.data : [];
  const exhibitionData = exhibitionsResult.status === 'fulfilled' ? exhibitionsResult.value.data : [];

  return {
    pages: normalizeProducts(extractContentArray(pagesData)),
    issues: normalizeProducts(extractContentArray(issuesData)),
    exhibitions: normalizeExhibitions(extractContentArray(exhibitionData)),
  };
}
