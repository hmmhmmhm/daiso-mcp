/**
 * GS25 GET API 핸들러
 */
/* c8 ignore start */

import { type ApiContext, errorResponse, successResponse } from './response.js';
import {
  attachDistanceToGs25Stores,
  extractGs25ProductCandidates,
  fetchGs25NormalizedKeyword,
  fetchGs25Stores,
  filterGs25StoresByKeyword,
  geocodeGs25Address,
  sortGs25Stores,
} from '../services/gs25/client.js';

/**
 * GS25 매장 검색 API 핸들러
 * GET /api/gs25/stores?keyword={키워드}&lat={위도}&lng={경도}
 */
export async function handleGs25FindStores(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const serviceCode = c.req.query('serviceCode') || '01';
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const rawLat = c.req.query('lat');
  const rawLng = c.req.query('lng');

  const parsedLat = rawLat ? parseFloat(rawLat) : undefined;
  const parsedLng = rawLng ? parseFloat(rawLng) : undefined;

  let latitude = typeof parsedLat === 'number' && Number.isFinite(parsedLat) ? parsedLat : undefined;
  let longitude = typeof parsedLng === 'number' && Number.isFinite(parsedLng) ? parsedLng : undefined;
  let geocodeUsed = false;

  try {
    if ((typeof latitude !== 'number' || typeof longitude !== 'number') && keyword.trim().length > 0) {
      const geocoded = await geocodeGs25Address(keyword, {
        timeout: 15000,
        googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
      });
      if (geocoded) {
        latitude = geocoded.latitude;
        longitude = geocoded.longitude;
        geocodeUsed = true;
      }
    }

    const storeResult = await fetchGs25Stores(
      {
        serviceCode,
      },
      {
        timeout: 20000,
      },
    );

    const filtered = filterGs25StoresByKeyword(storeResult.stores, keyword);
    const withDistance = attachDistanceToGs25Stores(filtered, latitude, longitude);
    const stores = sortGs25Stores(withDistance).slice(0, limit);

    return successResponse(
      c,
      {
        serviceCode,
        keyword,
        geocodeUsed,
        location:
          typeof latitude === 'number' && typeof longitude === 'number'
            ? { latitude, longitude }
            : null,
        cacheHit: storeResult.cacheHit,
        stores,
      },
      {
        total: filtered.length,
        pageSize: limit,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'GS25_STORE_SEARCH_FAILED', message, 500);
  }
}

/**
 * GS25 상품 검색 API 핸들러
 * GET /api/gs25/products?keyword={검색어}
 */
export async function handleGs25SearchProducts(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const serviceCode = c.req.query('serviceCode') || '01';
  const limit = parseInt(c.req.query('limit') || '20', 10);

  if (keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword)를 입력해주세요.');
  }

  try {
    const result = await fetchGs25Stores(
      {
        serviceCode,
        keyword,
        useCache: false,
      },
      {
        timeout: 20000,
      },
    );

    const products = extractGs25ProductCandidates(result.stores).slice(0, limit);

    return successResponse(
      c,
      {
        serviceCode,
        keyword,
        count: products.length,
        products,
      },
      {
        total: products.length,
        pageSize: limit,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'GS25_PRODUCT_SEARCH_FAILED', message, 500);
  }
}

/**
 * GS25 재고 조회 API 핸들러
 * GET /api/gs25/inventory?keyword={검색어}&storeKeyword={매장키워드}&lat={위도}&lng={경도}
 */
export async function handleGs25CheckInventory(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const storeKeyword = c.req.query('storeKeyword') || '';
  const serviceCode = c.req.query('serviceCode') || '01';
  const storeLimit = parseInt(c.req.query('storeLimit') || '20', 10);
  const rawLat = c.req.query('lat');
  const rawLng = c.req.query('lng');

  const parsedLat = rawLat ? parseFloat(rawLat) : undefined;
  const parsedLng = rawLng ? parseFloat(rawLng) : undefined;

  let latitude = typeof parsedLat === 'number' && Number.isFinite(parsedLat) ? parsedLat : undefined;
  let longitude = typeof parsedLng === 'number' && Number.isFinite(parsedLng) ? parsedLng : undefined;
  let geocodeUsed = false;

  if (keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword)를 입력해주세요.');
  }

  try {
    if ((typeof latitude !== 'number' || typeof longitude !== 'number') && storeKeyword.trim().length > 0) {
      const baseStores = await fetchGs25Stores(
        {
          serviceCode,
        },
        {
          timeout: 20000,
        },
      );

      const firstAddress =
        filterGs25StoresByKeyword(baseStores.stores, storeKeyword).find((store) => store.address.trim().length > 0)
          ?.address || '';

      if (firstAddress.length > 0) {
        const geocoded = await geocodeGs25Address(firstAddress, {
          timeout: 15000,
          googleMapsApiKey: c.env?.GOOGLE_MAPS_API_KEY,
        });
        if (geocoded) {
          latitude = geocoded.latitude;
          longitude = geocoded.longitude;
          geocodeUsed = true;
        }
      }
    }

    let stockResult = await fetchGs25Stores(
      {
        serviceCode,
        keyword,
        realTimeStockYn: 'Y',
        latitude,
        longitude,
        useCache: false,
      },
      {
        timeout: 20000,
      },
    );

    let normalizedKeywordUsed = false;
    let normalizedKeyword: string | null = null;
    if (stockResult.stores.every((item) => item.searchItemName.length === 0)) {
      try {
        const normalized = await fetchGs25NormalizedKeyword(keyword, {
          timeout: 20000,
        });
        const fallbackKeyword = normalized?.searchKeyword || normalized?.keyword || '';
        if (fallbackKeyword.length > 0 && fallbackKeyword !== keyword.trim()) {
          stockResult = await fetchGs25Stores(
            {
              serviceCode,
              keyword: fallbackKeyword,
              realTimeStockYn: 'Y',
              latitude,
              longitude,
              useCache: false,
            },
            {
              timeout: 20000,
            },
          );
          normalizedKeywordUsed = true;
          normalizedKeyword = fallbackKeyword;
        }
      } catch {
        // 정규화 실패 시 기본 조회 결과를 유지합니다.
      }
    }

    const filtered = filterGs25StoresByKeyword(stockResult.stores, storeKeyword);
    const withDistance = attachDistanceToGs25Stores(filtered, latitude, longitude);
    const stores = sortGs25Stores(withDistance).slice(0, storeLimit);

    const productName = filtered.find((item) => item.searchItemName.length > 0)?.searchItemName || null;
    const productPrice = filtered.find((item) => item.searchItemSellPrice !== null)?.searchItemSellPrice ?? null;
    const inStockStoreCount = filtered.filter((item) => item.realStockQuantity > 0).length;
    const totalStockQuantity = filtered.reduce((sum, item) => sum + Math.max(item.realStockQuantity, 0), 0);

    return successResponse(c, {
      serviceCode,
      keyword,
      normalizedKeywordUsed,
      normalizedKeyword,
      storeKeyword,
      geocodeUsed,
      location:
        typeof latitude === 'number' && typeof longitude === 'number'
          ? { latitude, longitude }
          : null,
      product: {
        name: productName,
        sellPrice: productPrice,
      },
      inventory: {
        totalStoreCount: stockResult.totalCount,
        matchedStoreCount: filtered.length,
        inStockStoreCount,
        totalStockQuantity,
        count: stores.length,
        stores,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'GS25_INVENTORY_CHECK_FAILED', message, 500);
  }
}
/* c8 ignore stop */
