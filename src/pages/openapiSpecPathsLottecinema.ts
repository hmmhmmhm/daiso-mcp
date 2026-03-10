/**
 * OpenAPI 경로 정의 (롯데시네마)
 */

export const OPENAPI_PATHS_LOTTECINEMA = {
  '/api/lottecinema/theaters': {
    get: {
      operationId: 'lottecinemaFindNearbyTheaters',
      summary: '롯데시네마 주변 지점 조회',
      description: '좌표 기준으로 롯데시네마 지점을 거리순으로 조회합니다.',
      parameters: [
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
          name: 'playDate',
          in: 'query',
          required: false,
          description: '조회 날짜 (YYYYMMDD)',
          schema: { type: 'string', example: '20260310' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: '최대 결과 수',
          schema: { type: 'integer', default: 10, minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LotteCinemaTheaterSearchResponse' },
            },
          },
        },
        '500': {
          description: '롯데시네마 API 호출 실패',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
  '/api/lottecinema/movies': {
    get: {
      operationId: 'lottecinemaListNowShowing',
      summary: '롯데시네마 영화/회차 목록 조회',
      description: '날짜, 지점, 영화 조건으로 롯데시네마 영화 및 상영 회차를 조회합니다.',
      parameters: [
        {
          name: 'playDate',
          in: 'query',
          required: false,
          description: '조회 날짜 (YYYYMMDD)',
          schema: { type: 'string', example: '20260310' },
        },
        {
          name: 'theaterId',
          in: 'query',
          required: false,
          description: '지점 ID (예: 1016)',
          schema: { type: 'string', example: '1016' },
        },
        {
          name: 'movieId',
          in: 'query',
          required: false,
          description: '대표 영화 코드 (예: 23816)',
          schema: { type: 'string', example: '23816' },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LotteCinemaMovieListResponse' },
            },
          },
        },
        '500': {
          description: '롯데시네마 API 호출 실패',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
  '/api/lottecinema/seats': {
    get: {
      operationId: 'lottecinemaGetRemainingSeats',
      summary: '롯데시네마 잔여 좌석 조회',
      description: '영화/지점/날짜 조건으로 회차별 잔여 좌석 수를 조회합니다.',
      parameters: [
        {
          name: 'playDate',
          in: 'query',
          required: false,
          description: '조회 날짜 (YYYYMMDD)',
          schema: { type: 'string', example: '20260310' },
        },
        {
          name: 'theaterId',
          in: 'query',
          required: false,
          description: '지점 ID',
          schema: { type: 'string', example: '1016' },
        },
        {
          name: 'movieId',
          in: 'query',
          required: false,
          description: '대표 영화 코드',
          schema: { type: 'string', example: '23816' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: '최대 결과 수',
          schema: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LotteCinemaSeatListResponse' },
            },
          },
        },
        '500': {
          description: '롯데시네마 API 호출 실패',
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
