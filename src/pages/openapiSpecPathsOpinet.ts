/**
 * OpenAPI 경로 정의 (오피넷)
 */

const fuelCodeSchema = {
  type: 'string',
  enum: ['B027', 'D047', 'B034', 'C004', 'K015'],
  default: 'B027',
};

const successResponse = {
  description: '조회 성공',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
        },
      },
    },
  },
};

export const OPENAPI_PATHS_OPINET = {
  '/api/opinet/average': {
    get: {
      operationId: 'opinetGetAveragePrices',
      summary: '오피넷 전국 평균 유가',
      description: '한국석유공사 오피넷 전국 평균 유가를 조회합니다.',
      parameters: [],
      responses: {
        '200': successResponse,
        '500': {
          description: '오피넷 키 누락 또는 API 호출 실패',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
    },
  },
  '/api/opinet/lowest': {
    get: {
      operationId: 'opinetGetLowestPriceStations',
      summary: '오피넷 최저가 주유소',
      description: '전국 또는 지역별 최저가 주유소를 유종별로 조회합니다.',
      parameters: [
        { name: 'fuelCode', in: 'query', required: false, description: '유종 코드', schema: fuelCodeSchema },
        { name: 'areaCode', in: 'query', required: false, description: '오피넷 지역 코드', schema: { type: 'string' } },
        { name: 'count', in: 'query', required: false, description: '결과 수(1~20)', schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 } },
      ],
      responses: { '200': successResponse },
    },
  },
  '/api/opinet/stations/around': {
    get: {
      operationId: 'opinetSearchStationsAround',
      summary: '오피넷 반경 내 주유소',
      description: 'KATEC x/y, WGS84 위경도, 또는 location 키워드 기준 반경 내 주유소를 조회합니다.',
      parameters: [
        { name: 'x', in: 'query', required: false, description: '기준 위치 X좌표(KATEC)', schema: { type: 'number' } },
        { name: 'y', in: 'query', required: false, description: '기준 위치 Y좌표(KATEC)', schema: { type: 'number' } },
        { name: 'lat', in: 'query', required: false, description: '위도(WGS84)', schema: { type: 'number' } },
        { name: 'lng', in: 'query', required: false, description: '경도(WGS84)', schema: { type: 'number' } },
        { name: 'location', in: 'query', required: false, description: '장소/주소 키워드. 예: 강남역', schema: { type: 'string' } },
        { name: 'radiusMeters', in: 'query', required: false, description: '검색 반경 m(100~5000)', schema: { type: 'integer', minimum: 100, maximum: 5000, default: 3000 } },
        { name: 'fuelCode', in: 'query', required: false, description: '유종 코드', schema: fuelCodeSchema },
        { name: 'sort', in: 'query', required: false, description: '정렬 기준', schema: { type: 'string', enum: ['price', 'distance'], default: 'price' } },
      ],
      responses: { '200': successResponse },
    },
  },
  '/api/opinet/station': {
    get: {
      operationId: 'opinetGetStationDetail',
      summary: '오피넷 주유소 상세정보',
      description: '오피넷 주유소 ID로 상세 정보, 부가시설, 유종별 가격을 조회합니다.',
      parameters: [
        { name: 'id', in: 'query', required: true, description: '오피넷 주유소 ID', schema: { type: 'string' } },
      ],
      responses: { '200': successResponse },
    },
  },
} as const;
