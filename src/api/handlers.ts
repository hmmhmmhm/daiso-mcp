/**
 * GET API 핸들러
 *
 * MCP 미지원 서비스를 위한 GET 기반 API 핸들러입니다.
 * 기존 도구의 핵심 함수들을 재사용합니다.
 */

import {
  enrichOliveyoungProductsWithNearbyStoreInventory,
  fetchOliveyoungProducts,
  fetchOliveyoungStores,
} from '../services/oliveyoung/client.js';
import { fetchCuStock, fetchCuStores, geocodeCuAddress } from '../services/cu/client.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';
export {
  handleCheckInventory,
  handleFindStores,
  handleGetDisplayLocation,
  handleGetProduct,
  handleSearchProducts,
} from './daisoHandlers.js';

/**
 * 올리브영 상품 검색 API 핸들러
 * GET /api/oliveyoung/products?keyword={검색어}
 */
export async function handleOliveyoungSearchProducts(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const page = parseInt(c.req.query('page') || '1');
  const size = parseInt(c.req.query('size') || '20');
  const sort = c.req.query('sort') || '01';
  const includeSoldOut = c.req.query('includeSoldOut') === 'true';

  if (keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword)를 입력해주세요.');
  }

  try {
    const result = await fetchOliveyoungProducts(
      {
        keyword,
        page,
        size,
        sort,
        includeSoldOut,
      },
      {
        apiKey: c.env?.ZYTE_API_KEY,
      },
    );

    return successResponse(
      c,
      {
        keyword,
        totalCount: result.totalCount,
        nextPage: result.nextPage,
        count: result.products.length,
        products: result.products,
      },
      { total: result.totalCount, page, pageSize: size },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'OLIVEYOUNG_PRODUCT_SEARCH_FAILED', message, 500);
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
    const enrichedInventory = await enrichOliveyoungProductsWithNearbyStoreInventory(
      productResult.products,
      {
        latitude: lat,
        longitude: lng,
        storeKeyword,
        maxProducts: Math.min(productResult.products.length, 5),
      },
      {
        apiKey: c.env.ZYTE_API_KEY,
      }
    );
    const inStockCount = enrichedInventory.products.filter((product) => product.inStock).length;

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
          stockCheckedCount: enrichedInventory.checkedCount,
          stockUncheckedCount: Math.max(0, productResult.products.length - enrichedInventory.checkedCount),
          inStockCount,
          outOfStockCount: enrichedInventory.products.length - inStockCount,
          products: enrichedInventory.products,
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
      const keywordStoreResult = await fetchCuStores(
        {
          searchWord: storeKeyword,
        },
        {
          timeout: 15000,
          apiKey: c.env?.ZYTE_API_KEY,
        },
      );
      const firstAddress = keywordStoreResult.stores.find((store) => store.address.trim().length > 0)?.address || '';
      if (firstAddress.length > 0) {
        const geocoded = await geocodeCuAddress(firstAddress, {
          timeout: 15000,
          googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
        });
        if (geocoded) {
          const hasStockSeed = !!firstStockItem?.itemCode;
          storeResult = await fetchCuStores(
            {
              latitude: geocoded.latitude,
              longitude: geocoded.longitude,
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
      }
      storeResult ||= keywordStoreResult;
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
