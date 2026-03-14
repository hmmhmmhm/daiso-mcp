/**
 * OpenAPI 경로 정의 (롯데마트)
 */

export const OPENAPI_PATHS_LOTTEMART = {
  '/api/lottemart/stores': {
    get: {
      operationId: 'lottemartFindStores',
      summary: '롯데마트 매장 검색',
      description: '지역/키워드 조건으로 롯데마트 계열 매장을 조회합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '매장명 또는 주소 키워드',
          schema: { type: 'string' },
        },
        {
          name: 'area',
          in: 'query',
          required: false,
          description: '지역 (예: 서울, 경기, 제주)',
          schema: { type: 'string' },
        },
        {
          name: 'brandVariant',
          in: 'query',
          required: false,
          description: '브랜드 변형 필터',
          schema: {
            type: 'string',
            enum: ['lottemart', 'toysrus', 'max', 'bottlebunker', 'mealguru', 'grandgrocery', 'other'],
          },
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
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        '200': {
          description: '검색 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LotteMartStoreSearchResponse' },
            },
          },
        },
      },
    },
  },
  '/api/lottemart/products': {
    get: {
      operationId: 'lottemartSearchProducts',
      summary: '롯데마트 상품 검색',
      description: '특정 롯데마트 매장을 기준으로 상품 가격과 재고를 조회합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: true,
          description: '상품 검색어',
          schema: { type: 'string' },
          example: '콜라',
        },
        {
          name: 'storeCode',
          in: 'query',
          required: false,
          description: '매장 코드',
          schema: { type: 'string' },
          example: '2301',
        },
        {
          name: 'storeName',
          in: 'query',
          required: false,
          description: '매장명',
          schema: { type: 'string' },
          example: '강변점',
        },
        {
          name: 'area',
          in: 'query',
          required: false,
          description: '지역 (storeName 해석 보조용)',
          schema: { type: 'string' },
          example: '서울',
        },
        {
          name: 'pageLimit',
          in: 'query',
          required: false,
          description: '추가 조회할 최대 페이지 수',
          schema: { type: 'integer', default: 3, minimum: 1, maximum: 20 },
        },
      ],
      responses: {
        '200': {
          description: '검색 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LotteMartProductSearchResponse' },
            },
          },
        },
        '400': {
          description: '잘못된 요청',
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
