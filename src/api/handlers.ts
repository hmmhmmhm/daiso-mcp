/**
 * GET API 핸들러
 *
 * MCP 미지원 서비스를 위한 GET 기반 API 핸들러입니다.
 * 기존 도구의 핵심 함수들을 재사용합니다.
 */

import type { Context } from 'hono';
import { fetchProducts } from '../services/daiso/tools/searchProducts.js';
import { fetchStores } from '../services/daiso/tools/findStores.js';
import {
  fetchOnlineStock,
  fetchStoreInventory,
} from '../services/daiso/tools/checkInventory.js';
import { fetchProductById } from '../services/daiso/tools/getPriceInfo.js';
import { getImageUrl } from '../services/daiso/api.js';

/** API 응답 형식 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

/**
 * 성공 응답 생성
 */
function successResponse<T>(c: Context, data: T, meta?: ApiResponse<T>['meta']) {
  return c.json<ApiResponse<T>>({
    success: true,
    data,
    meta,
  });
}

/**
 * 에러 응답 생성
 */
function errorResponse(c: Context, code: string, message: string, status: 400 | 404 | 500 = 400) {
  return c.json<ApiResponse<never>>(
    {
      success: false,
      error: { code, message },
    },
    status
  );
}

/**
 * 제품 검색 API 핸들러
 * GET /api/daiso/products?q={검색어}&page={페이지}&pageSize={개수}
 */
export async function handleSearchProducts(c: Context) {
  const query = c.req.query('q');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '30');

  if (!query || query.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(q)를 입력해주세요.');
  }

  try {
    const { products, totalCount } = await fetchProducts(query, page, pageSize);

    return successResponse(c, { products }, { total: totalCount, page, pageSize });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'SEARCH_FAILED', message, 500);
  }
}

/**
 * 제품 상세 정보 API 핸들러
 * GET /api/daiso/products/:id
 */
export async function handleGetProduct(c: Context) {
  const productId = c.req.param('id');

  if (!productId) {
    return errorResponse(c, 'MISSING_ID', '제품 ID가 필요합니다.');
  }

  try {
    const product = await fetchProductById(productId);

    if (!product) {
      return errorResponse(c, 'NOT_FOUND', '제품을 찾을 수 없습니다.', 404);
    }

    const result = {
      id: product.PD_NO,
      name: product.PDNM || product.EXH_PD_NM,
      price: parseInt(product.PD_PRC) || 0,
      currency: 'KRW',
      imageUrl: getImageUrl(product.ATCH_FILE_URL),
      brand: product.BRND_NM || undefined,
      soldOut: product.SOLD_OUT_YN === 'Y',
      isNew: product.NEW_PD_YN === 'Y',
    };

    return successResponse(c, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'FETCH_FAILED', message, 500);
  }
}

/**
 * 매장 검색 API 핸들러
 * GET /api/daiso/stores?keyword={키워드}&sido={시도}&gugun={구군}&dong={동}&limit={개수}
 */
export async function handleFindStores(c: Context) {
  const keyword = c.req.query('keyword');
  const sido = c.req.query('sido');
  const gugun = c.req.query('gugun');
  const dong = c.req.query('dong');
  const limit = parseInt(c.req.query('limit') || '50');

  if (!keyword && !sido) {
    return errorResponse(c, 'MISSING_PARAMS', '검색어(keyword) 또는 지역(sido)을 입력해주세요.');
  }

  try {
    const stores = await fetchStores(keyword, sido, gugun, dong);
    const limitedStores = stores.slice(0, limit);

    return successResponse(c, { stores: limitedStores }, { total: stores.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'SEARCH_FAILED', message, 500);
  }
}

/**
 * 재고 확인 API 핸들러
 * GET /api/daiso/inventory?productId={제품ID}&lat={위도}&lng={경도}&keyword={매장검색어}
 */
export async function handleCheckInventory(c: Context) {
  const productId = c.req.query('productId');
  const lat = parseFloat(c.req.query('lat') || '37.5665');
  const lng = parseFloat(c.req.query('lng') || '126.978');
  const keyword = c.req.query('keyword') || '';
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '30');

  if (!productId) {
    return errorResponse(c, 'MISSING_PRODUCT_ID', '제품 ID(productId)를 입력해주세요.');
  }

  try {
    const [onlineStock, storeResult] = await Promise.all([
      fetchOnlineStock(productId),
      fetchStoreInventory(productId, lat, lng, page, pageSize, keyword),
    ]);

    const inStockStores = storeResult.stores.filter((s) => s.quantity > 0);

    const result = {
      productId,
      location: { latitude: lat, longitude: lng },
      onlineStock,
      storeInventory: {
        totalStores: storeResult.totalCount,
        inStockCount: inStockStores.length,
        stores: storeResult.stores,
      },
    };

    return successResponse(c, result, { total: storeResult.totalCount, page, pageSize });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'INVENTORY_CHECK_FAILED', message, 500);
  }
}
