/**
 * OpenAPI 경로 정의 (세븐일레븐)
 */

export const OPENAPI_PATHS_SEVENELEVEN = {
  '/api/seveneleven/products': {
    get: {
      operationId: 'sevenelevenSearchProducts',
      summary: '세븐일레븐 상품 검색',
      description: '키워드로 세븐일레븐 상품을 검색합니다.',
      parameters: [
        {
          name: 'query',
          in: 'query',
          required: true,
          description: '상품 검색어',
          schema: { type: 'string' },
          example: '삼각김밥',
        },
        {
          name: 'page',
          in: 'query',
          required: false,
          description: '페이지 번호',
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
          description: '정렬 기준',
          schema: { type: 'string', default: 'recommend' },
        },
      ],
      responses: {
        '200': {
          description: '검색 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProductSearchResponse' },
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
  '/api/seveneleven/stores': {
    get: {
      operationId: 'sevenelevenSearchStores',
      summary: '세븐일레븐 매장 검색',
      description: '키워드로 세븐일레븐 매장을 검색합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: true,
          description: '매장 검색어',
          schema: { type: 'string' },
          example: '안산 중앙역',
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: '최대 결과 수',
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 9999 },
        },
      ],
      responses: {
        '200': {
          description: '검색 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StoreSearchResponse' },
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
  '/api/seveneleven/inventory': {
    get: {
      operationId: 'sevenelevenCheckInventory',
      summary: '세븐일레븐 재고 확인',
      description: '상품 키워드와 매장 키워드로 세븐일레븐 매장별 재고 수량을 조회합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: true,
          description: '재고를 확인할 상품 검색어',
          schema: { type: 'string' },
          example: '핫식스',
        },
        {
          name: 'storeKeyword',
          in: 'query',
          required: false,
          description: '매장명 또는 지역 키워드',
          schema: { type: 'string' },
          example: '안산 중앙역',
        },
        {
          name: 'storeLimit',
          in: 'query',
          required: false,
          description: '반환할 최대 매장 수',
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
        },
        {
          name: 'timeoutMs',
          in: 'query',
          required: false,
          description: '요청 제한 시간(ms)',
          schema: { type: 'integer', default: 20000, minimum: 1000, maximum: 60000 },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SevenElevenInventoryResponse' },
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
          description: '세븐일레븐 재고 조회 실패',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
  '/api/seveneleven/popwords': {
    get: {
      operationId: 'sevenelevenGetSearchPopwords',
      summary: '세븐일레븐 인기 검색어 조회',
      description: '세븐일레븐 인기 검색어 목록을 조회합니다.',
      parameters: [
        {
          name: 'label',
          in: 'query',
          required: false,
          description: '조회 라벨 (기본값: home)',
          schema: { type: 'string', default: 'home' },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProductSearchResponse' },
            },
          },
        },
      },
    },
  },
  '/api/seveneleven/catalog': {
    get: {
      operationId: 'sevenelevenGetCatalogSnapshot',
      summary: '세븐일레븐 카탈로그 스냅샷',
      description: '공개 카탈로그(페이지/이슈/기획전) 데이터를 조회합니다.',
      parameters: [
        {
          name: 'includeIssues',
          in: 'query',
          required: false,
          description: '이슈 상품 포함 여부',
          schema: { type: 'boolean', default: true },
        },
        {
          name: 'includeExhibition',
          in: 'query',
          required: false,
          description: '기획전 포함 여부',
          schema: { type: 'boolean', default: true },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: '각 목록 최대 반환 수',
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProductSearchResponse' },
            },
          },
        },
      },
    },
  },
} as const;
