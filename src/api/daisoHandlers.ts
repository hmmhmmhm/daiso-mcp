/**
 * 다이소 GET API 핸들러
 */

import { getImageUrl } from '../services/daiso/api.js';
import { toProductSummary } from '../services/daiso/product.js';
import { fetchOnlineStock, fetchStoreInventory } from '../services/daiso/tools/checkInventory.js';
import { fetchDisplayLocation } from '../services/daiso/tools/getDisplayLocation.js';
import { fetchProductById } from '../services/daiso/tools/getPriceInfo.js';
import { fetchStores } from '../services/daiso/tools/findStores.js';
import { fetchProducts } from '../services/daiso/tools/searchProducts.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

export async function handleSearchProducts(c: ApiContext) {
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

export async function handleGetProduct(c: ApiContext) {
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

export async function handleFindStores(c: ApiContext) {
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

export async function handleCheckInventory(c: ApiContext) {
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
    const [onlineStock, storeResult, productDoc] = await Promise.all([
      fetchOnlineStock(productId),
      fetchStoreInventory(productId, lat, lng, page, pageSize, keyword),
      fetchProductById(productId).catch(() => null),
    ]);

    const inStockStores = storeResult.stores.filter((s) => s.quantity > 0);
    const product = productDoc ? toProductSummary(productDoc) : undefined;

    const result = {
      productId,
      product,
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

export async function handleGetDisplayLocation(c: ApiContext) {
  const productId = c.req.query('productId')?.trim();
  const storeCode = c.req.query('storeCode')?.trim();

  if (!productId || productId.length === 0) {
    return errorResponse(c, 'MISSING_PRODUCT_ID', '상품 ID(productId)를 입력해주세요.');
  }

  if (!storeCode || storeCode.length === 0) {
    return errorResponse(c, 'MISSING_STORE_CODE', '매장 코드(storeCode)를 입력해주세요.');
  }

  try {
    const result = await fetchDisplayLocation(productId, storeCode);

    return successResponse(c, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'DISPLAY_LOCATION_FAILED', message, 500);
  }
}
