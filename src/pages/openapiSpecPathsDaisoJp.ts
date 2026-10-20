/** 일본 다이소 전체 REST 명세. */
const product = {
  type: 'object',
  required: [
    'id',
    'name',
    'country',
    'price',
    'currency',
    'url',
    'onlineAvailable',
    'storeInventorySupported',
  ],
  properties: {
    id: { type: 'string', pattern: '^\\d{13}$' },
    name: { type: 'string' },
    country: { type: 'string', const: 'JP' },
    price: { type: ['number', 'null'], description: '세금 포함 엔화 가격. 확인 불가 시 null.' },
    currency: { type: 'string', const: 'JPY' },
    url: { type: 'string', format: 'uri' },
    imageUrl: { type: 'string', format: 'uri' },
    onlineAvailable: {
      type: ['boolean', 'null'],
      description: '온라인 판매 가능 여부. 매장 재고가 아니며 검색 목록에서는 null.',
    },
    storeInventorySupported: { type: 'boolean', const: false },
  },
};
const store = {
  type: 'object',
  required: ['id', 'name', 'address', 'hours', 'url', 'latitude', 'longitude', 'brand'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    address: { type: 'string' },
    hours: { type: 'string' },
    url: { type: 'string', format: 'uri' },
    latitude: { type: ['number', 'null'] },
    longitude: { type: ['number', 'null'] },
    brand: { type: 'string' },
  },
};
const pagination = {
  country: { type: 'string', const: 'JP' },
  page: { type: 'integer' },
  hasNext: { type: 'boolean' },
  note: { type: 'string' },
};
function responses(data: object) {
  return {
    '200': {
      description: '일본 상품 또는 매장 조회 결과. JPY 가격이며 매장 재고 미지원.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['success', 'data'],
            properties: { success: { type: 'boolean', const: true }, data },
          },
        },
        'text/html': { schema: { type: 'string' } },
      },
    },
    '400': { description: '잘못된 검색어·상품 ID·페이지' },
    '502': { description: '원본 응답 형식 변경. 빈 결과가 아닙니다.' },
    '503': { description: '일본 다이소 연결 오류 또는 원본 차단' },
  };
}
const format = {
  name: 'format',
  in: 'query',
  description: '웹 읽기 에이전트는 반드시 html 지정',
  schema: { type: 'string', enum: ['html', 'json'] },
};
const page = {
  name: 'page',
  in: 'query',
  schema: { type: 'integer', minimum: 1, maximum: 100, default: 1 },
};
export const OPENAPI_PATHS_DAISO_JP = {
  '/api/daiso-jp/products': {
    get: {
      operationId: 'daisoJpSearchProducts',
      summary: '일본 다이소 온라인 상품 검색',
      description:
        '일본어 키워드 또는 JAN 코드. 가격은 JPY이며 매장 재고가 아닙니다. 원본 페이지 단위 조회입니다.',
      parameters: [
        {
          name: 'q',
          in: 'query',
          required: true,
          schema: { type: 'string', minLength: 1, maxLength: 100 },
        },
        page,
        format,
      ],
      responses: responses({
        type: 'object',
        required: ['country', 'currency', 'query', 'page', 'products', 'hasNext', 'note'],
        properties: {
          ...pagination,
          currency: { type: 'string', const: 'JPY' },
          query: { type: 'string' },
          products: { type: 'array', items: product },
        },
      }),
    },
  },
  '/api/daiso-jp/products/{id}': {
    get: {
      operationId: 'daisoJpGetProduct',
      summary: '일본 다이소 온라인 상품 상세',
      description: 'onlineAvailable은 온라인 판매 가능 여부입니다. 매장 재고·수량 미지원.',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^\\d{13}$' },
        },
        format,
      ],
      responses: responses(product),
    },
  },
  '/api/daiso-jp/stores': {
    get: {
      operationId: 'daisoJpFindStores',
      summary: '일본 다이소 매장 검색',
      description:
        '공식 사이트의 매장명·주소 키워드 검색. 계열 브랜드는 brand로 구분합니다. 지명만으로 특정 도시를 확정하지 마세요.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: true,
          schema: { type: 'string', minLength: 1, maxLength: 100 },
        },
        page,
        format,
      ],
      responses: responses({
        type: 'object',
        required: ['country', 'keyword', 'page', 'stores', 'hasNext', 'note'],
        properties: {
          ...pagination,
          keyword: { type: 'string' },
          stores: { type: 'array', items: store },
        },
      }),
    },
  },
};
