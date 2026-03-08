/**
 * OpenAPI 경로 정의 (CU)
 */

export const OPENAPI_PATHS_CU = {
  '/api/cu/stores': {
    get: {
      operationId: 'cuFindStores',
      summary: 'CU 매장 검색',
      description: '위치(위도/경도)와 키워드로 CU 매장을 검색합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '매장명 또는 지역 키워드 (예: 강남, 안산)',
          schema: { type: 'string' },
          example: '강남',
        },
        {
          name: 'lat',
          in: 'query',
          required: false,
          description: '위도 (선택)',
          schema: { type: 'number', format: 'float' },
        },
        {
          name: 'lng',
          in: 'query',
          required: false,
          description: '경도 (선택)',
          schema: { type: 'number', format: 'float' },
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
              schema: { $ref: '#/components/schemas/CuStoreSearchResponse' },
            },
          },
        },
        '500': {
          description: 'CU API 호출 실패',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
  '/api/cu/inventory': {
    get: {
      operationId: 'cuCheckInventory',
      summary: 'CU 재고 확인',
      description: '상품 키워드로 CU 재고를 조회하고 주변 매장 정보를 함께 반환합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: true,
          description: '재고를 확인할 상품 키워드',
          schema: { type: 'string' },
          example: '과자',
        },
        {
          name: 'lat',
          in: 'query',
          required: false,
          description: '위도 (선택)',
          schema: { type: 'number', format: 'float' },
        },
        {
          name: 'lng',
          in: 'query',
          required: false,
          description: '경도 (선택)',
          schema: { type: 'number', format: 'float' },
        },
        {
          name: 'storeKeyword',
          in: 'query',
          required: false,
          description: '주변 매장 필터 키워드',
          schema: { type: 'string' },
        },
        {
          name: 'size',
          in: 'query',
          required: false,
          description: '재고 검색 결과 수',
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
        },
        {
          name: 'offset',
          in: 'query',
          required: false,
          description: '재고 검색 시작 오프셋',
          schema: { type: 'integer', default: 0, minimum: 0 },
        },
        {
          name: 'searchSort',
          in: 'query',
          required: false,
          description: '재고 정렬 방식',
          schema: { type: 'string', default: 'recom' },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CuInventoryResponse' },
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
      },
    },
  },
} as const;
