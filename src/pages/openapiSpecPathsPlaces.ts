/**
 * OpenAPI 경로 정의 (장소 검색)
 */

export const OPENAPI_PATHS_PLACES = {
  '/api/places/search': {
    get: {
      operationId: 'placesSearchNearby',
      summary: '음식점/카페 등 주변 장소 검색',
      description:
        '네이버 지역 검색으로 특정 지역의 음식점, 카페, 디저트 가게 등 주변 장소를 조회합니다. 좌표 반경 검색이 아니라 키워드 기반 검색입니다.',
      parameters: [
        {
          name: 'location',
          in: 'query',
          required: false,
          description: '지역/역/주소 키워드 (예: 강남역, 성수동)',
          schema: { type: 'string' },
        },
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '직접 검색어 (예: 라멘, 브런치, 조용한 카페)',
          schema: { type: 'string' },
        },
        {
          name: 'category',
          in: 'query',
          required: false,
          description: '장소 카테고리',
          schema: {
            type: 'string',
            enum: ['restaurant', 'cafe', 'food', 'dessert', 'all'],
            default: 'all',
          },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: '최대 결과 수',
          schema: { type: 'integer', default: 5, minimum: 1, maximum: 5 },
        },
        {
          name: 'sort',
          in: 'query',
          required: false,
          description: '정렬 방식',
          schema: { type: 'string', enum: ['random', 'comment'], default: 'random' },
        },
      ],
      responses: {
        '200': {
          description: '검색 성공',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: {
                    type: 'object',
                    properties: {
                      provider: { type: 'string', example: 'naverLocal' },
                      searchMode: { type: 'string', example: 'keyword' },
                      query: { type: 'string', example: '강남역 카페' },
                      places: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
          },
        },
        '400': {
          description: '잘못된 요청 (위치/검색어 누락)',
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
