export const OPENAPI_PATHS_COMPARE = {
  '/api/compare/products': {
    get: {
      operationId: 'compareProducts',
      summary: '키 없는 통합 상품 가격 후보 비교',
      description:
        '새 외부 키 없이 다이소, GS25, 세븐일레븐, 이마트24 상품 검색을 묶어 가격 후보를 비교합니다.',
      parameters: [
        {
          name: 'keyword',
          in: 'query',
          required: true,
          description: '비교할 상품 검색어',
          schema: { type: 'string' },
        },
        {
          name: 'services',
          in: 'query',
          required: false,
          description: '쉼표로 구분한 서비스 목록(daiso,gs25,seveneleven,emart24)',
          schema: { type: 'string' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: '서비스별 최대 결과 수',
          schema: { type: 'integer', default: 5, minimum: 1, maximum: 20 },
        },
      ],
      responses: {
        '200': {
          description: '통합 상품 가격 후보 비교 결과',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: {
                    type: 'object',
                    properties: {
                      keyword: { type: 'string' },
                      serviceCount: { type: 'integer' },
                      resultCount: { type: 'integer' },
                      bestPrice: { type: ['object', 'null'] },
                      results: { type: 'array', items: { type: 'object' } },
                      errors: { type: 'array', items: { type: 'object' } },
                      note: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
