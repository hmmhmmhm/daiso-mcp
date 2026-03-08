/**
 * 이마트24 GET API 핸들러
 */

import { type ApiContext, errorResponse, successResponse } from './response.js';
import {
  calculateDistanceM,
  fetchEmart24StoreDetail,
  fetchEmart24Stores,
  searchEmart24Products,
  searchEmart24StockByStores,
} from '../services/emart24/client.js';

/**
 * 이마트24 매장 검색 API 핸들러
 * GET /api/emart24/stores?keyword={키워드}&lat={위도}&lng={경도}
 */
export async function handleEmart24FindStores(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const area1 = c.req.query('area1') || '';
  const area2 = c.req.query('area2') || '';
  const service24h = c.req.query('service24h') === 'true';
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const rawLat = c.req.query('lat');
  const rawLng = c.req.query('lng');
  const parsedLat = rawLat ? parseFloat(rawLat) : undefined;
  const parsedLng = rawLng ? parseFloat(rawLng) : undefined;
  const lat = typeof parsedLat === 'number' && Number.isFinite(parsedLat) ? parsedLat : undefined;
  const lng = typeof parsedLng === 'number' && Number.isFinite(parsedLng) ? parsedLng : undefined;

  try {
    const result = await fetchEmart24Stores(
      {
        keyword,
        area1,
        area2,
        page,
        service24h,
      },
      {
        timeout: 15000,
      },
    );

    const stores = result.stores
      .map((store) => {
        if (typeof lat !== 'number' || typeof lng !== 'number' || store.latitude === 0 || store.longitude === 0) {
          return store;
        }

        return {
          ...store,
          distanceM: calculateDistanceM(lat, lng, store.latitude, store.longitude),
        };
      })
      .sort((a, b) => (a.distanceM ?? Number.MAX_SAFE_INTEGER) - (b.distanceM ?? Number.MAX_SAFE_INTEGER))
      .slice(0, limit);

    return successResponse(
      c,
      {
        location: typeof lat === 'number' && typeof lng === 'number' ? { latitude: lat, longitude: lng } : null,
        keyword,
        area1,
        area2,
        service24h,
        stores,
      },
      {
        total: result.totalCount,
        page,
        pageSize: limit,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'EMART24_STORE_SEARCH_FAILED', message, 500);
  }
}

/**
 * 이마트24 상품 검색 API 핸들러
 * GET /api/emart24/products?keyword={검색어}
 */
export async function handleEmart24SearchProducts(c: ApiContext) {
  const keyword = c.req.query('keyword') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '10', 10);
  const sortType =
    (c.req.query('sortType') as 'SALE' | 'LATEST' | 'PRICE_ASC' | 'PRICE_DESC' | null) || 'SALE';
  const saleProductYn = (c.req.query('saleProductYn') as 'Y' | 'N' | null) || 'N';

  if (keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '검색어(keyword)를 입력해주세요.');
  }

  try {
    const result = await searchEmart24Products(
      {
        keyword,
        page,
        pageSize,
        sortType,
        saleProductYn,
      },
      {
        timeout: 15000,
      },
    );

    return successResponse(
      c,
      {
        keyword,
        sortType,
        saleProductYn,
        products: result.products,
      },
      {
        total: result.totalCount,
        page,
        pageSize,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'EMART24_PRODUCT_SEARCH_FAILED', message, 500);
  }
}

/**
 * 이마트24 재고 조회 API 핸들러
 * GET /api/emart24/inventory?pluCd={PLU코드}&bizNoArr={매장코드들}
 */
export async function handleEmart24CheckInventory(c: ApiContext) {
  const pluCd = c.req.query('pluCd') || '';
  const bizNoArr = c.req.query('bizNoArr') || '';

  if (pluCd.trim().length === 0) {
    return errorResponse(c, 'MISSING_PLU_CD', '상품 PLU 코드(pluCd)를 입력해주세요.');
  }

  const bizNos = bizNoArr
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (bizNos.length === 0) {
    return errorResponse(c, 'MISSING_BIZ_NO_ARR', '매장 코드 목록(bizNoArr)을 입력해주세요.');
  }

  try {
    const stockResult = await searchEmart24StockByStores(
      {
        pluCd,
        bizNos,
      },
      {
        timeout: 15000,
      },
    );

    const detailResults = await Promise.allSettled(
      bizNos.map((bizNo) => fetchEmart24StoreDetail(bizNo, { timeout: 15000 })),
    );

    const stores = bizNos.map((bizNo, index) => {
      const qty = (stockResult.storeGoodsQty || []).find((item) => String(item.BIZNO || '') === bizNo);
      const detail = detailResults[index];
      const info = detail.status === 'fulfilled' ? detail.value.storeInfo : undefined;

      return {
        bizNo,
        bizQty: Number.parseInt(String(qty?.BIZQTY || 0), 10) || 0,
        storeName: info?.storeNm || '',
        address: info?.storeAddr || '',
        phone: info?.tel || '',
      };
    });

    return successResponse(c, {
      pluCd,
      goodsInfo: stockResult.storeGoodsInfo || null,
      count: stores.length,
      stores,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'EMART24_INVENTORY_CHECK_FAILED', message, 500);
  }
}
