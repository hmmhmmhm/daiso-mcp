/**
 * 장소 검색 GET API 핸들러
 */
import { type ApiContext, errorResponse, successResponse } from './response.js';
import { searchNaverLocalPlaces } from '../services/places/client.js';
import type { PlaceCategory } from '../services/places/types.js';
import { getErrorMessage } from '../core/errors.js';

const PLACE_CATEGORIES = new Set(['restaurant', 'cafe', 'food', 'dessert', 'all']);

function parseCategory(value: string | undefined): PlaceCategory {
  if (value && PLACE_CATEGORIES.has(value)) {
    return value as PlaceCategory;
  }
  return 'all';
}

export async function handlePlacesSearch(c: ApiContext) {
  const location = c.req.query('location') || '';
  const keyword = c.req.query('keyword') || '';
  const limit = Number.parseInt(c.req.query('limit') || '5', 10);
  const start = Number.parseInt(c.req.query('start') || '1', 10);
  const sort = c.req.query('sort') === 'comment' ? 'comment' : 'random';
  const category = parseCategory(c.req.query('category'));

  if (location.trim().length === 0 && keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_QUERY', '위치(location) 또는 검색어(keyword)를 입력해주세요.');
  }

  try {
    const result = await searchNaverLocalPlaces({
      naverClientId: c.env?.NAVER_CLIENT_ID,
      naverClientSecret: c.env?.NAVER_CLIENT_SECRET,
      location,
      keyword,
      category,
      limit,
      start,
      sort,
    });

    return successResponse(c, result, {
      total: result.totalCount,
      page: start,
      pageSize: result.count,
    });
  } catch (error) {
    return errorResponse(c, 'PLACES_SEARCH_FAILED', getErrorMessage(error), 500);
  }
}
