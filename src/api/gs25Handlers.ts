/**
 * GS25 GET API 핸들러
 */
/* c8 ignore start */

import { type ApiContext, errorResponse, successResponse } from './response.js';
import {
  attachDistanceToGs25Stores,
  fetchGs25SearchProducts,
  fetchGs25Stores,
  filterGs25StoresByKeyword,
  geocodeGs25Address,
  selectGs25StoresForKeyword,
  sortGs25Stores,
} from '../services/gs25/client.js';

const GS25_FALLBACK_STORE_LOOKUP_ITEM_CODE = '8801117752804';

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

    let storeResult = await fetchGs25Stores(
      {
        serviceCode,
        latitude,
        longitude,
      },
      {
        timeout: 20000,
      },
    );
    let fallbackUsed = false;

    if (storeResult.stores.length === 0 && typeof latitude === 'number' && typeof longitude === 'number') {
      try {
        const fallbackResult = await fetchGs25Stores(
          {
            serviceCode,
            itemCode: GS25_FALLBACK_STORE_LOOKUP_ITEM_CODE,
            realTimeStockYn: 'Y',
            latitude,
            longitude,
            useCache: false,
          },
          {
            timeout: 20000,
          },
        );

        if (fallbackResult.stores.length > 0) {
          storeResult = fallbackResult;
          fallbackUsed = true;
        }
      } catch {
        fallbackUsed = false;
      }
    }

    const selected = selectGs25StoresForKeyword(storeResult.stores, keyword, {
      relaxWhenEmpty: typeof latitude === 'number' && typeof longitude === 'number',
    });
    const withDistance = attachDistanceToGs25Stores(selected.stores, latitude, longitude);
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
        filterRelaxed: selected.filterRelaxed,
        fallbackUsed,
        stores,
      },
      {
        total: selected.stores.length,
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
  const limit = parseInt(c.req.query('limit') || '20', 10);

  if (keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword)를 입력해주세요.');
  }

  try {
    const products = await fetchGs25SearchProducts(keyword, { timeout: 20000 });
    const limitedProducts = products.slice(0, limit);

    return successResponse(
      c,
      {
        keyword,
        count: limitedProducts.length,
        products: limitedProducts.map((p) => ({
          itemCode: p.itemCode,
          itemName: p.itemName,
          shortItemName: p.shortItemName,
          imageUrl: p.imageUrl,
          rating: p.rating,
          stockCheckEnabled: p.stockCheckEnabled,
        })),
      },
      {
        total: limitedProducts.length,
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
  const itemCode = c.req.query('itemCode') || '';
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

  if (keyword.trim().length === 0 && itemCode.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword) 또는 상품 코드(itemCode)를 입력해주세요.');
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

    // 1단계: totalSearch API로 키워드 → itemCode 변환
    let firstProduct: Awaited<ReturnType<typeof fetchGs25SearchProducts>>[number] | undefined;

    let stockResult: Awaited<ReturnType<typeof fetchGs25Stores>>;
    let itemCodeUsed = itemCode.trim().length > 0;
    let resolvedItemCode: string | null = itemCode.trim().length > 0 ? itemCode.trim() : null;

    if (resolvedItemCode) {
      stockResult = await fetchGs25Stores(
        {
          serviceCode,
          itemCode: resolvedItemCode,
          realTimeStockYn: 'Y',
          latitude,
          longitude,
          useCache: false,
        },
        {
          timeout: 20000,
        },
      );
    } else {
      const searchProducts = await fetchGs25SearchProducts(keyword, { timeout: 20000 });
      firstProduct = searchProducts.find((p) => p.itemCode.length > 0);

      if (firstProduct) {
        resolvedItemCode = firstProduct.itemCode;
        itemCodeUsed = true;

        stockResult = await fetchGs25Stores(
          {
            serviceCode,
            itemCode: resolvedItemCode,
            realTimeStockYn: 'Y',
            latitude,
            longitude,
            useCache: false,
          },
          {
            timeout: 20000,
          },
        );
      } else {
        stockResult = await fetchGs25Stores(
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
      }
    }

    const selected = selectGs25StoresForKeyword(stockResult.stores, storeKeyword, {
      relaxWhenEmpty: typeof latitude === 'number' && typeof longitude === 'number',
    });
    const filtered = selected.stores;
    const withDistance = attachDistanceToGs25Stores(filtered, latitude, longitude);
    const stores = sortGs25Stores(withDistance).slice(0, storeLimit);

    // 상품 정보: searchProducts에서 먼저 가져오고, 없으면 stores에서
    const productName = firstProduct?.itemName || firstProduct?.shortItemName ||
      filtered.find((item) => item.searchItemName.length > 0)?.searchItemName || null;
    const productPrice = filtered.find((item) => item.searchItemSellPrice !== null)?.searchItemSellPrice ?? null;
    const inStockStoreCount = filtered.filter((item) => item.realStockQuantity > 0).length;
    const totalStockQuantity = filtered.reduce((sum, item) => sum + Math.max(item.realStockQuantity, 0), 0);

    return successResponse(c, {
      serviceCode,
      keyword,
      itemCodeUsed,
      itemCode: resolvedItemCode,
      storeKeyword,
      geocodeUsed,
      filterRelaxed: selected.filterRelaxed,
      location:
        typeof latitude === 'number' && typeof longitude === 'number'
          ? { latitude, longitude }
          : null,
      product: {
        name: productName,
        sellPrice: productPrice,
        imageUrl: firstProduct?.imageUrl || null,
        rating: firstProduct?.rating || null,
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
