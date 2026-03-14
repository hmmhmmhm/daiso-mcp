/**
 * 롯데마트 GET API 핸들러
 */

import { type ApiContext, errorResponse, successResponse } from './response.js';
import { fetchLotteMartStores, searchLotteMartProducts } from '../services/lottemart/client.js';

/**
 * 롯데마트 매장 검색 API 핸들러
 * GET /api/lottemart/stores?keyword={키워드}&lat={위도}&lng={경도}
 */
export async function handleLotteMartFindStores(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const area = c.req.query('area') || '';
  const brandVariant = c.req.query('brandVariant') || '';
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const rawLat = c.req.query('lat');
  const rawLng = c.req.query('lng');
  const parsedLat = rawLat ? parseFloat(rawLat) : undefined;
  const parsedLng = rawLng ? parseFloat(rawLng) : undefined;
  const latitude = typeof parsedLat === 'number' && Number.isFinite(parsedLat) ? parsedLat : undefined;
  const longitude = typeof parsedLng === 'number' && Number.isFinite(parsedLng) ? parsedLng : undefined;

  try {
    const result = await fetchLotteMartStores(
      {
        area,
        keyword,
        brandVariant,
        latitude,
        longitude,
        limit,
      },
      {
        timeout: 15000,
        googleMapsApiKey: c.env.GOOGLE_MAPS_API_KEY,
      },
    );

    return successResponse(
      c,
      {
        area: area || null,
        keyword,
        brandVariant: brandVariant || null,
        geocodeUsed: result.geocodeUsed,
        location: result.location,
        count: result.stores.length,
        stores: result.stores,
      },
      {
        total: result.stores.length,
        page: 1,
        pageSize: limit,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'LOTTEMART_STORE_SEARCH_FAILED', message, 500);
  }
}

/**
 * 롯데마트 상품 검색 API 핸들러
 * GET /api/lottemart/products?keyword={검색어}&storeCode={매장코드}
 */
export async function handleLotteMartSearchProducts(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const area = c.req.query('area') || '';
  const storeCode = c.req.query('storeCode') || '';
  const storeName = c.req.query('storeName') || '';
  const pageLimit = parseInt(c.req.query('pageLimit') || '3', 10);

  if (keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword)를 입력해주세요.');
  }

  if (storeCode.trim().length === 0 && storeName.trim().length === 0) {
    return errorResponse(c, 'MISSING_STORE', 'storeCode 또는 storeName 중 하나를 입력해주세요.');
  }

  try {
    const result = await searchLotteMartProducts(
      {
        area,
        storeCode,
        storeName,
        keyword,
        pageLimit,
      },
      {
        timeout: 15000,
      },
    );

    return successResponse(
      c,
      {
        area: result.area,
        storeCode: result.storeCode,
        storeName: result.storeName,
        keyword,
        pageLimit,
        totalPages: result.totalPages,
        products: result.products,
      },
      {
        total: result.totalCount,
        page: 1,
        pageSize: result.products.length,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'LOTTEMART_PRODUCT_SEARCH_FAILED', message, 500);
  }
}
