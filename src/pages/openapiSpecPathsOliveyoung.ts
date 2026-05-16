/**
 * OpenAPI 경로 정의 (올리브영)
 */

export const OPENAPI_PATHS_OLIVEYOUNG = {
      '/api/oliveyoung/products': {
        get: {
          operationId: 'oliveyoungSearchProducts',
          summary: '올리브영 상품 검색',
          description:
            '키워드로 올리브영 상품 목록을 조회합니다. "어떤 거 있나요", "종류 보여줘" 같은 요청은 이 엔드포인트를 먼저 사용하세요.',
          parameters: [
            {
              name: 'keyword',
              in: 'query',
              required: true,
              description: '상품 검색어',
              schema: { type: 'string' },
              example: '마스크팩',
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              description: '상품 검색 페이지 번호',
              schema: { type: 'integer', default: 1, minimum: 1 },
            },
            {
              name: 'size',
              in: 'query',
              required: false,
              description: '페이지당 결과 수',
              schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
            },
            {
              name: 'sort',
              in: 'query',
              required: false,
              description: '정렬 코드',
              schema: { type: 'string', default: '01' },
            },
            {
              name: 'includeSoldOut',
              in: 'query',
              required: false,
              description: '품절 포함 여부 (true/false)',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            '200': {
              description: '검색 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OliveyoungProductSearchResponse' },
                },
              },
            },
            '400': {
              description: '잘못된 요청 (검색어 누락)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '500': {
              description: '올리브영 API 호출 실패',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/oliveyoung/stores': {
        get: {
          operationId: 'oliveyoungFindStores',
          summary: '올리브영 매장 검색',
          description: '위치(위도/경도)와 키워드로 올리브영 매장을 검색합니다.',
          parameters: [
            {
              name: 'keyword',
              in: 'query',
              required: false,
              description: '매장명 또는 지역 키워드 (예: 명동, 강남)',
              schema: { type: 'string' },
              example: '명동',
            },
            {
              name: 'lat',
              in: 'query',
              required: false,
              description: '위도 (기본값: 서울 시청 37.5665)',
              schema: { type: 'number', format: 'float', default: 37.5665 },
            },
            {
              name: 'lng',
              in: 'query',
              required: false,
              description: '경도 (기본값: 서울 시청 126.978)',
              schema: { type: 'number', format: 'float', default: 126.978 },
            },
            {
              name: 'pageIdx',
              in: 'query',
              required: false,
              description: '매장 검색 페이지 번호',
              schema: { type: 'integer', default: 1, minimum: 1 },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: '최대 결과 수',
              schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            '200': {
              description: '검색 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OliveyoungStoreSearchResponse' },
                },
              },
            },
            '500': {
              description: '올리브영 API 호출 실패',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/oliveyoung/inventory': {
        get: {
          operationId: 'oliveyoungCheckInventory',
          summary: '올리브영 재고 확인',
          description:
            '상품 키워드로 올리브영 재고를 검색하고 주변 매장 정보를 함께 조회합니다. 상위 상품에는 storeInventory가 포함되며 매장별 재고 수량/품절/미판매 상태를 확인할 수 있습니다.',
          parameters: [
            {
              name: 'keyword',
              in: 'query',
              required: true,
              description: '재고를 확인할 상품 키워드',
              schema: { type: 'string' },
              example: '선크림',
            },
            {
              name: 'lat',
              in: 'query',
              required: false,
              description: '위도 (기본값: 서울 시청 37.5665)',
              schema: { type: 'number', format: 'float', default: 37.5665 },
            },
            {
              name: 'lng',
              in: 'query',
              required: false,
              description: '경도 (기본값: 서울 시청 126.978)',
              schema: { type: 'number', format: 'float', default: 126.978 },
            },
            {
              name: 'storeKeyword',
              in: 'query',
              required: false,
              description: '주변 매장 필터 키워드',
              schema: { type: 'string' },
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              description: '상품 검색 페이지 번호',
              schema: { type: 'integer', default: 1, minimum: 1 },
            },
            {
              name: 'size',
              in: 'query',
              required: false,
              description: '페이지당 결과 수',
              schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
            },
            {
              name: 'sort',
              in: 'query',
              required: false,
              description: '정렬 코드',
              schema: { type: 'string', default: '01' },
            },
            {
              name: 'includeSoldOut',
              in: 'query',
              required: false,
              description: '품절 포함 여부 (true/false)',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            '200': {
              description: '조회 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OliveyoungInventoryResponse' },
                },
              },
            },
            '400': {
              description: '잘못된 요청 (검색어 누락)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '500': {
              description: '올리브영 API 호출 실패',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },};
