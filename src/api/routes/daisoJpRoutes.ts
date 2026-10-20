/** 일본 다이소 공개 GET API. */
import type { Hono } from 'hono';
import type { AppBindings, ApiContext } from '../response.js';
import { successResponse, errorResponse, serviceErrorResponse } from '../response.js';
import { withEdgeCache } from '../../utils/cache.js';
import { ServiceError } from '../../core/errors.js';
import { searchProducts, getProduct, findStores } from '../../services/daisoJp/client.js';
import { jpQuery, jpPage, jpProductId } from '../../services/daisoJp/index.js';

async function execute(c: ApiContext, operation: () => Promise<unknown>): Promise<Response> {
  try {
    return successResponse(c, await operation());
  } catch (error) {
    const failure =
      error instanceof ServiceError
        ? error
        : new ServiceError(
            'DAISO_JP_REQUEST_FAILED',
            '일본 다이소 조회에 실패했습니다. 잠시 후 다시 시도해주세요.',
            503,
            true,
          );
    return serviceErrorResponse(c, failure, 'daiso_jp');
  }
}

export function registerDaisoJpRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/daiso-jp/products/:id', (c) => {
    const id = jpProductId.safeParse(c.req.param('id'));
    if (!id.success)
      return errorResponse(
        c,
        'INVALID_INPUT',
        '상품 ID는 일본 다이소 검색 결과의 13자리 코드를 사용하세요.',
      );
    return withEdgeCache(c.req.url, { ttlSeconds: 1800, keyPrefix: 'daiso-jp-product-v1' }, () =>
      execute(c, () => getProduct(id.data)),
    );
  });
  app.get('/api/daiso-jp/products', (c) => {
    const query = jpQuery.safeParse(c.req.query('q'));
    const page = jpPage.safeParse(Number(c.req.query('page') ?? '1'));
    if (!query.success || !page.success)
      return errorResponse(c, 'INVALID_INPUT', 'q는 1~100자, page는 1~100 사이 정수여야 합니다.');
    return withEdgeCache(c.req.url, { ttlSeconds: 1800, keyPrefix: 'daiso-jp-search-v1' }, () =>
      execute(c, () => searchProducts(query.data, page.data)),
    );
  });
  app.get('/api/daiso-jp/stores', (c) => {
    const keyword = jpQuery.safeParse(c.req.query('keyword'));
    const page = jpPage.safeParse(Number(c.req.query('page') ?? '1'));
    if (!keyword.success || !page.success)
      return errorResponse(
        c,
        'INVALID_INPUT',
        'keyword는 1~100자, page는 1~100 사이 정수여야 합니다.',
      );
    return withEdgeCache(c.req.url, { ttlSeconds: 86400, keyPrefix: 'daiso-jp-stores-v1' }, () =>
      execute(c, () => findStores(keyword.data, page.data)),
    );
  });
}
