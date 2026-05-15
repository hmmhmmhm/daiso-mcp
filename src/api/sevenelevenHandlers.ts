/**
 * 세븐일레븐 GET API 핸들러
 */
/* c8 ignore start */

import { type ApiContext, errorResponse, successResponse } from './response.js';
import {
  fetchSevenElevenStoresByKeyword,
  fetchSevenElevenCatalogSnapshot,
  fetchSevenElevenSearchPopwords,
  searchSevenElevenProducts,
} from '../services/seveneleven/client.js';
import { checkSevenElevenInventory } from '../services/seveneleven/inventory.js';

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'y') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'n') {
    return false;
  }

  return defaultValue;
}

/**
 * 세븐일레븐 상품 검색 API 핸들러
 * GET /api/seveneleven/products?query={검색어}&page={페이지}&size={개수}&sort={정렬}
 */
export async function handleSevenElevenSearchProducts(c: ApiContext) {
  const query = c.req.query('query') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const size = parseInt(c.req.query('size') || '20', 10);
  const sort = c.req.query('sort') || 'recommend';

  if (query.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(query)를 입력해주세요.');
  }

  try {
    const result = await searchSevenElevenProducts({
      query,
      page,
      size,
      sort,
    });

    return successResponse(
      c,
      {
        query: result.query,
        count: result.products.length,
        totalCount: result.totalCount,
        collectionIds: result.collectionIds,
        products: result.products,
      },
      {
        total: result.totalCount,
        page,
        pageSize: size,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'SEVENELEVEN_PRODUCT_SEARCH_FAILED', message, 500);
  }
}

/**
 * 세븐일레븐 매장 검색 API 핸들러
 * GET /api/seveneleven/stores?keyword={검색어}&limit={개수}
 */
export async function handleSevenElevenSearchStores(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 20;

  if (keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_KEYWORD', '매장 검색어(keyword)를 입력해주세요.');
  }

  try {
    const result = await fetchSevenElevenStoresByKeyword({
      keyword,
      limit: safeLimit,
    });

    return successResponse(
      c,
      {
        keyword: result.query,
        count: result.stores.length,
        totalCount: result.totalCount,
        stores: result.stores,
      },
      {
        total: result.totalCount,
        page: 1,
        pageSize: safeLimit,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'SEVENELEVEN_STORE_SEARCH_FAILED', message, 500);
  }
}

/**
 * 세븐일레븐 재고 확인 API 핸들러
 * GET /api/seveneleven/inventory?keyword={검색어}&storeKeyword={매장키워드}
 */
export async function handleSevenElevenCheckInventory(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const storeKeyword = c.req.query('storeKeyword') || '';
  const storeLimit = parseInt(c.req.query('storeLimit') || '20', 10);
  const timeoutMs = parseInt(c.req.query('timeoutMs') || '20000', 10);
  const safeStoreLimit = Number.isFinite(storeLimit) && storeLimit > 0 ? storeLimit : 20;
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000;

  if (keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword)를 입력해주세요.');
  }

  try {
    const result = await checkSevenElevenInventory(
      {
        productKeyword: keyword,
        storeKeyword,
        storeLimit: safeStoreLimit,
      },
      {
        timeout: safeTimeoutMs,
      },
    );

    const note = result.stockAvailable
      ? '실시간 재고 데이터가 포함되어 있습니다.'
      : result.stockError
        ? `실시간 재고 API 호출에 실패했습니다: ${result.stockError.message}`
        : '실시간 재고 API가 현재 제한되어 있어 매장 목록만 제공됩니다.';

    return successResponse(
      c,
      {
        keyword,
        storeKeyword,
        product: result.product,
        stockAvailable: result.stockAvailable,
        stockError: result.stockError,
        note,
        inventory: {
          totalStoreCount: result.totalStoreCount,
          inStockStoreCount: result.inStockStoreCount,
          count: result.stores.length,
          stores: result.stores,
        },
      },
      {
        total: result.totalStoreCount,
        pageSize: safeStoreLimit,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'SEVENELEVEN_INVENTORY_CHECK_FAILED', message, 500);
  }
}

/**
 * 세븐일레븐 인기 검색어 API 핸들러
 * GET /api/seveneleven/popwords?label={라벨}
 */
export async function handleSevenElevenGetSearchPopwords(c: ApiContext) {
  const label = c.req.query('label') || 'home';

  try {
    const keywords = await fetchSevenElevenSearchPopwords(label);

    return successResponse(c, {
      label,
      available: keywords.length > 0,
      count: keywords.length,
      keywords,
      note:
        keywords.length === 0
          ? '현재 응답에서 인기 검색어 목록을 찾지 못했습니다.'
          : '홈 인기 검색어를 조회했습니다.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'SEVENELEVEN_POPWORD_FETCH_FAILED', message, 500);
  }
}

/**
 * 세븐일레븐 카탈로그 스냅샷 API 핸들러
 * GET /api/seveneleven/catalog?includeIssues={bool}&includeExhibition={bool}&limit={개수}
 */
export async function handleSevenElevenGetCatalogSnapshot(c: ApiContext) {
  const includeIssues = parseBoolean(c.req.query('includeIssues'), true);
  const includeExhibition = parseBoolean(c.req.query('includeExhibition'), true);
  const limit = parseInt(c.req.query('limit') || '20', 10);

  try {
    const result = await fetchSevenElevenCatalogSnapshot({
      includeIssues,
      includeExhibition,
    });

    return successResponse(c, {
      options: {
        includeIssues,
        includeExhibition,
        limit,
      },
      pages: {
        totalCount: result.pages.length,
        items: result.pages.slice(0, limit),
      },
      issues: {
        totalCount: result.issues.length,
        items: result.issues.slice(0, limit),
      },
      exhibitions: {
        totalCount: result.exhibitions.length,
        items: result.exhibitions.slice(0, limit),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'SEVENELEVEN_CATALOG_FETCH_FAILED', message, 500);
  }
}
/* c8 ignore stop */
