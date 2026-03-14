/**
 * OpenAPI 경로 정의 (이마트24)
 */

export const OPENAPI_PATHS_EMART24 = {
  '/api/emart24/stores': {
    get: {
      operationId: 'emart24FindStores',
      summary: '이마트24 매장 검색',
      description: '키워드/지역 조건으로 이마트24 매장을 조회합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '매장명 또는 지역 키워드 (예: 강남)',
          schema: { type: 'string' },
        },
        {
          name: 'area1',
          in: 'query',
          required: false,
          description: '시/도 (예: 서울특별시)',
          schema: { type: 'string' },
        },
        {
          name: 'area2',
          in: 'query',
          required: false,
          description: '구/군 (예: 강남구)',
          schema: { type: 'string' },
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
          name: 'service24h',
          in: 'query',
          required: false,
          description: '24시간 매장만 조회 여부',
          schema: { type: 'boolean', default: false },
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
              schema: { $ref: '#/components/schemas/Emart24StoreSearchResponse' },
            },
          },
        },
      },
    },
  },
  '/api/emart24/products': {
    get: {
      operationId: 'emart24SearchProducts',
      summary: '이마트24 상품 검색',
      description: '키워드로 이마트24 상품 목록을 조회합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: true,
          description: '상품 검색어',
          schema: { type: 'string' },
          example: '두바이',
        },
        {
          name: 'page',
          in: 'query',
          required: false,
          description: '페이지 번호',
          schema: { type: 'integer', default: 1, minimum: 1 },
        },
        {
          name: 'pageSize',
          in: 'query',
          required: false,
          description: '페이지당 결과 수',
          schema: { type: 'integer', default: 10, minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        '200': {
          description: '검색 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Emart24ProductSearchResponse' },
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
  '/api/emart24/inventory': {
    get: {
      operationId: 'emart24CheckInventory',
      summary: '이마트24 재고 조회',
      description:
        'PLU 코드 또는 상품 키워드와 매장 코드 목록/매장 키워드로 이마트24 재고를 조회합니다. 대화형 흐름에서는 pluCd + storeKeyword 조합을 우선 사용하세요.',
      parameters: [
        {
          name: 'pluCd',
          in: 'query',
          required: false,
          description: '상품 PLU 코드 (keyword 미입력 시 권장)',
          schema: { type: 'string' },
          example: '8800244010504',
        },
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '상품 검색어 (pluCd 미입력 시 사용)',
          schema: { type: 'string' },
          example: '고양이 츄르',
        },
        {
          name: 'bizNoArr',
          in: 'query',
          required: false,
          description: '쉼표 구분 매장 코드 목록',
          schema: { type: 'string' },
          example: '28339,05015,23233',
        },
        {
          name: 'storeCode',
          in: 'query',
          required: false,
          description: '단일 매장 코드',
          schema: { type: 'string' },
          example: '28339',
        },
        {
          name: 'storeKeyword',
          in: 'query',
          required: false,
          description: '매장 검색 키워드 (예: 안산 중앙역)',
          schema: { type: 'string' },
        },
        {
          name: 'area1',
          in: 'query',
          required: false,
          description: '시/도',
          schema: { type: 'string' },
        },
        {
          name: 'area2',
          in: 'query',
          required: false,
          description: '구/군',
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
          name: 'storeLimit',
          in: 'query',
          required: false,
          description: '조회할 매장 수',
          schema: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Emart24InventoryResponse' },
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
