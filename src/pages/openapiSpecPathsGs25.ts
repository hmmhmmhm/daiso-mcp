/**
 * OpenAPI 경로 정의 (GS25)
 */

export const OPENAPI_PATHS_GS25 = {
  '/api/gs25/stores': {
    get: {
      operationId: 'gs25FindStores',
      summary: 'GS25 매장 검색',
      description: '키워드/좌표 기준으로 GS25 매장을 조회합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '매장명 또는 주소 키워드 (예: 강남)',
          schema: { type: 'string' },
        },
        {
          name: 'lat',
          in: 'query',
          required: false,
          description: '위도',
          schema: { type: 'number', format: 'float' },
        },
        {
          name: 'lng',
          in: 'query',
          required: false,
          description: '경도',
          schema: { type: 'number', format: 'float' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: '최대 결과 수',
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 200 },
        },
      ],
      responses: {
        '200': {
          description: '검색 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Gs25StoreSearchResponse' },
            },
          },
        },
      },
    },
  },
  '/api/gs25/products': {
    get: {
      operationId: 'gs25SearchProducts',
      summary: 'GS25 상품 키워드 검색',
      description: '키워드로 GS25 상품 후보를 조회합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: true,
          description: '상품 검색어',
          schema: { type: 'string' },
          example: '오감자',
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: '최대 결과 수',
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 200 },
        },
      ],
      responses: {
        '200': {
          description: '검색 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Gs25ProductSearchResponse' },
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
  '/api/gs25/inventory': {
    get: {
      operationId: 'gs25CheckInventory',
      summary: 'GS25 재고 조회',
      description: '상품 키워드 또는 itemCode 기준으로 GS25 매장별 재고를 조회합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '상품 검색어 (itemCode가 없을 때 사용)',
          schema: { type: 'string' },
          example: '오감자',
        },
        {
          name: 'itemCode',
          in: 'query',
          required: false,
          description: '상품 코드 (상품 검색 결과에서 전달)',
          schema: { type: 'string' },
          example: '8801056038861',
        },
        {
          name: 'storeKeyword',
          in: 'query',
          required: false,
          description: '매장명/주소 필터 키워드',
          schema: { type: 'string' },
          example: '강남',
        },
        {
          name: 'lat',
          in: 'query',
          required: false,
          description: '위도',
          schema: { type: 'number', format: 'float' },
        },
        {
          name: 'lng',
          in: 'query',
          required: false,
          description: '경도',
          schema: { type: 'number', format: 'float' },
        },
        {
          name: 'storeLimit',
          in: 'query',
          required: false,
          description: '반환할 최대 매장 수',
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 200 },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Gs25InventoryResponse' },
            },
          },
        },
        '400': {
          description: '잘못된 요청 (필수 파라미터 누락)',
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
