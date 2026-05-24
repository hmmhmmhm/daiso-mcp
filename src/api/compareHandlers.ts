import { compareProducts, parseCompareServices } from '../services/compare/client.js';
import { type ApiContext, errorResponse, successResponse } from './response.js';

export async function handleCompareProducts(c: ApiContext) {
  const keyword = c.req.query('keyword') || c.req.query('q') || '';
  const limit = parseInt(c.req.query('limit') || '5', 10);
  const services = parseCompareServices(c.req.query('services'));

  if (keyword.trim().length === 0) {
    return errorResponse(c, 'MISSING_KEYWORD', '검색어(keyword)를 입력해주세요.');
  }

  try {
    const result = await compareProducts({
      keyword,
      limit,
      services,
    });

    return successResponse(c, result, {
      total: result.resultCount,
      page: 1,
      pageSize: limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return errorResponse(c, 'COMPARE_PRODUCTS_FAILED', message, 500);
  }
}
