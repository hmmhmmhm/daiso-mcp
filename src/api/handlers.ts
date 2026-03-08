/**
 * GET API 핸들러
 *
 * MCP 미지원 서비스를 위한 GET 기반 API 핸들러입니다.
 * 기존 도구의 핵심 함수들을 재사용합니다.
 */

import { fetchProducts } from '../services/daiso/tools/searchProducts.js';
import { fetchStores } from '../services/daiso/tools/findStores.js';
import {
  fetchOnlineStock,
  fetchStoreInventory,
} from '../services/daiso/tools/checkInventory.js';
import { fetchProductById } from '../services/daiso/tools/getPriceInfo.js';
import { getImageUrl } from '../services/daiso/api.js';
import {
  fetchOliveyoungProducts,
  fetchOliveyoungStores,
} from '../services/oliveyoung/client.js';
import { fetchCuStock, fetchCuStores } from '../services/cu/client.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

/**
 * 제품 검색 API 핸들러
 * GET /api/daiso/products?q={검색어}&page={페이지}&pageSize={개수}
 */
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

/**
 * 제품 상세 정보 API 핸들러
 * GET /api/daiso/products/:id
 */
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

/**
 * 매장 검색 API 핸들러
 * GET /api/daiso/stores?keyword={키워드}&sido={시도}&gugun={구군}&dong={동}&limit={개수}
 */
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

/**
 * 재고 확인 API 핸들러
 * GET /api/daiso/inventory?productId={제품ID}&lat={위도}&lng={경도}&keyword={매장검색어}
 */
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

/**
 * 올리브영 매장 검색 API 핸들러
 * GET /api/oliveyoung/stores?keyword={키워드}&lat={위도}&lng={경도}
 */
export async function handleOliveyoungFindStores(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const lat = parseFloat(c.req.query('lat') || '37.5665');
  const lng = parseFloat(c.req.query('lng') || '126.978');
  const pageIdx = parseInt(c.req.query('pageIdx') || '1');
  const limit = parseInt(c.req.query('limit') || '20');

  try {
    const result = await fetchOliveyoungStores(
      {
        latitude: lat,
        longitude: lng,
        pageIdx,
        searchWords: keyword,
      },
      {
        apiKey: c.env?.ZYTE_API_KEY,
      }
    );

    return successResponse(
      c,
      {
        stores: result.stores.slice(0, limit),
      },
      { total: result.totalCount, page: pageIdx, pageSize: limit }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'OLIVEYOUNG_STORE_SEARCH_FAILED', message, 500);
  }
}

/**
 * 올리브영 재고 확인 API 핸들러
 * GET /api/oliveyoung/inventory?keyword={검색어}&lat={위도}&lng={경도}
 */
export async function handleOliveyoungCheckInventory(c: ApiContext) {
  const keyword = c.req.query('keyword');
  const lat = parseFloat(c.req.query('lat') || '37.5665');
  const lng = parseFloat(c.req.query('lng') || '126.978');
  const storeKeyword = c.req.query('storeKeyword') || '';
  const page = parseInt(c.req.query('page') || '1');
  const size = parseInt(c.req.query('size') || '20');
  const sort = c.req.query('sort') || '01';
  const includeSoldOut = c.req.query('includeSoldOut') === 'true';
  const storeLimit = parseInt(c.req.query('storeLimit') || '10');

  if (!keyword || keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword)를 입력해주세요.');
  }

  try {
    const [storeResult, productResult] = await Promise.all([
      fetchOliveyoungStores(
        {
          latitude: lat,
          longitude: lng,
          pageIdx: 1,
          searchWords: storeKeyword,
        },
        {
          apiKey: c.env.ZYTE_API_KEY,
        }
      ),
      fetchOliveyoungProducts(
        {
          keyword,
          page,
          size,
          sort,
          includeSoldOut,
        },
        {
          apiKey: c.env.ZYTE_API_KEY,
        }
      ),
    ]);

    return successResponse(
      c,
      {
        keyword,
        location: { latitude: lat, longitude: lng },
        nearbyStores: {
          totalCount: storeResult.totalCount,
          stores: storeResult.stores.slice(0, storeLimit),
        },
        inventory: {
          totalCount: productResult.totalCount,
          nextPage: productResult.nextPage,
          products: productResult.products,
        },
      },
      { total: productResult.totalCount, page, pageSize: size }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'OLIVEYOUNG_INVENTORY_CHECK_FAILED', message, 500);
  }
}

/**
 * CU 매장 검색 API 핸들러
 * GET /api/cu/stores?keyword={키워드}&lat={위도}&lng={경도}
 */
export async function handleCuFindStores(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const rawLat = c.req.query('lat');
  const rawLng = c.req.query('lng');
  const limit = parseInt(c.req.query('limit') || '20');
  const parsedLat = rawLat ? parseFloat(rawLat) : undefined;
  const parsedLng = rawLng ? parseFloat(rawLng) : undefined;
  const lat = typeof parsedLat === 'number' && Number.isFinite(parsedLat) ? parsedLat : undefined;
  const lng = typeof parsedLng === 'number' && Number.isFinite(parsedLng) ? parsedLng : undefined;

  try {
    const result = await fetchCuStores(
      {
        latitude: lat,
        longitude: lng,
        searchWord: keyword,
      },
      {
        timeout: 15000,
        apiKey: c.env.ZYTE_API_KEY,
      },
    );

    return successResponse(
      c,
      {
        location:
          typeof lat === 'number' && typeof lng === 'number' ? { latitude: lat, longitude: lng } : null,
        keyword,
        stores: result.stores.slice(0, limit),
      },
      { total: result.totalCount, pageSize: limit },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'CU_STORE_SEARCH_FAILED', message, 500);
  }
}

/**
 * CU 재고 검색 API 핸들러
 * GET /api/cu/inventory?keyword={검색어}&lat={위도}&lng={경도}
 */
export async function handleCuCheckInventory(c: ApiContext) {
  const keyword = c.req.query('keyword');
  const storeKeyword = c.req.query('storeKeyword') || '';
  const rawLat = c.req.query('lat');
  const rawLng = c.req.query('lng');
  const parsedLat = rawLat ? parseFloat(rawLat) : undefined;
  const parsedLng = rawLng ? parseFloat(rawLng) : undefined;
  const lat = typeof parsedLat === 'number' && Number.isFinite(parsedLat) ? parsedLat : undefined;
  const lng = typeof parsedLng === 'number' && Number.isFinite(parsedLng) ? parsedLng : undefined;
  const size = parseInt(c.req.query('size') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  const searchSort = c.req.query('searchSort') || 'recom';
  const storeLimit = parseInt(c.req.query('storeLimit') || '10');

  if (!keyword || keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword)를 입력해주세요.');
  }

  try {
    const stockResult = await fetchCuStock(
      {
        keyword,
        limit: size,
        offset,
        searchSort,
      },
      {
        timeout: 15000,
      },
    );

    const firstStockItem = stockResult.items.find((item) => item.itemCode.trim().length > 0) || null;
    const hasInputLocation = typeof lat === 'number' && typeof lng === 'number';
    const resolvedLat = hasInputLocation ? lat : undefined;
    const resolvedLng = hasInputLocation ? lng : undefined;
    let storeResult: Awaited<ReturnType<typeof fetchCuStores>> | null = null;

    // 좌표 미입력 + 매장 키워드 입력 시, 키워드 기반 매장 검색 결과를 우선 사용합니다.
    if (!hasInputLocation && storeKeyword.trim().length > 0) {
      storeResult = await fetchCuStores(
        {
          searchWord: storeKeyword,
        },
        {
          timeout: 15000,
          apiKey: c.env?.ZYTE_API_KEY,
        },
      );
    }

    if (!storeResult) {
      const hasStockSeed = !!firstStockItem?.itemCode;
      storeResult = await fetchCuStores(
        {
          latitude: resolvedLat,
          longitude: resolvedLng,
          searchWord: storeKeyword,
          itemCd: firstStockItem?.itemCode || '',
          onItemNo: firstStockItem?.onItemNo || '',
          jipCd: firstStockItem?.itemCode || '',
          isRecommend: hasStockSeed ? 'Y' : '',
          recommendId: hasStockSeed ? 'stock' : '',
          pageType: hasStockSeed ? 'search_improve stock_sch_improve' : 'search_improve',
        },
        {
          timeout: 15000,
          apiKey: c.env?.ZYTE_API_KEY,
        },
      );
    }

    return successResponse(
      c,
      {
        keyword,
        location:
          typeof resolvedLat === 'number' && typeof resolvedLng === 'number'
            ? { latitude: resolvedLat, longitude: resolvedLng }
            : null,
        nearbyStores: {
          totalCount: storeResult.totalCount,
          stockItemCode: firstStockItem?.itemCode || null,
          stockItemName: firstStockItem?.itemName || null,
          stores: storeResult.stores.slice(0, storeLimit),
        },
        inventory: {
          totalCount: stockResult.totalCount,
          spellModifyYn: stockResult.spellModifyYn,
          items: stockResult.items,
        },
      },
      { total: stockResult.totalCount, page: Math.floor(offset / Math.max(size, 1)) + 1, pageSize: size },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'CU_INVENTORY_CHECK_FAILED', message, 500);
  }
}
