/**
 * OpenAPI 경로 정의 (CGV)
 */

export const OPENAPI_PATHS_CGV = {
  '/api/cgv/theaters': {
    get: {
      operationId: 'cgvFindTheaters',
      summary: 'CGV 극장 목록 조회',
      description: '날짜/지역 코드 또는 위치 키워드 조건으로 CGV 극장 목록을 조회합니다.',
      parameters: [
        {
          name: 'playDate',
          in: 'query',
          required: false,
          description: '조회 날짜 (YYYYMMDD)',
          schema: { type: 'string', example: '20260304' },
        },
        {
          name: 'regionCode',
          in: 'query',
          required: false,
          description: '지역 코드 (예: 01 서울)',
          schema: { type: 'string', example: '01' },
        },
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '위치 키워드 (예: 안산 중앙역, 강남역)',
          schema: { type: 'string', example: '안산 중앙역' },
        },
        {
          name: 'lat',
          in: 'query',
          required: false,
          description: '위도',
          schema: { type: 'number', format: 'float', example: 37.3171 },
        },
        {
          name: 'lng',
          in: 'query',
          required: false,
          description: '경도',
          schema: { type: 'number', format: 'float', example: 126.8389 },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: '최대 결과 수',
          schema: { type: 'integer', default: 30, minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CgvTheaterSearchResponse' },
            },
          },
        },
        '500': {
          description: 'CGV API 호출 실패',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
  '/api/cgv/movies': {
    get: {
      operationId: 'cgvSearchMovies',
      summary: 'CGV 영화 목록 조회',
      description: '날짜/극장 조건으로 CGV 영화 목록을 조회합니다. theaterCode가 없으면 keyword 또는 좌표 기준으로 최근접 극장을 선택할 수 있습니다.',
      parameters: [
        {
          name: 'playDate',
          in: 'query',
          required: false,
          description: '조회 날짜 (YYYYMMDD)',
          schema: { type: 'string', example: '20260304' },
        },
        {
          name: 'theaterCode',
          in: 'query',
          required: false,
          description: '극장 코드 (예: 0056)',
          schema: { type: 'string', example: '0056' },
        },
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '위치 키워드 (예: 안산 중앙역, 강남역)',
          schema: { type: 'string', example: '안산 중앙역' },
        },
        {
          name: 'lat',
          in: 'query',
          required: false,
          description: '위도',
          schema: { type: 'number', format: 'float', example: 37.3171 },
        },
        {
          name: 'lng',
          in: 'query',
          required: false,
          description: '경도',
          schema: { type: 'number', format: 'float', example: 126.8389 },
        },
      ],
      responses: {
        '200': {
          description: '조회 성공',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CgvMovieSearchResponse' },
            },
          },
        },
        '500': {
          description: 'CGV API 호출 실패',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
  '/api/cgv/timetable': {
    get: {
      operationId: 'cgvGetTimetable',
      summary: 'CGV 시간표 조회',
      description: '날짜/극장/영화 조건으로 CGV 상영 시간표를 조회합니다. theaterCode가 없으면 keyword 또는 좌표 기준으로 최근접 극장을 선택할 수 있습니다.',
      parameters: [
        {
          name: 'playDate',
          in: 'query',
          required: false,
          description: '조회 날짜 (YYYYMMDD)',
          schema: { type: 'string', example: '20260304' },
        },
        {
          name: 'theaterCode',
          in: 'query',
          required: false,
          description: '극장 코드',
          schema: { type: 'string' },
        },
        {
          name: 'movieCode',
          in: 'query',
          required: false,
          description: '영화 코드',
          schema: { type: 'string' },
        },
        {
          name: 'keyword',
          in: 'query',
          required: false,
          description: '위치 키워드 (예: 안산 중앙역, 강남역)',
          schema: { type: 'string', example: '안산 중앙역' },
        },
        {
          name: 'lat',
          in: 'query',
          required: false,
          description: '위도',
          schema: { type: 'number', format: 'float', example: 37.3171 },
        },
        {
          name: 'lng',
          in: 'query',
          required: false,
          description: '경도',
          schema: { type: 'number', format: 'float', example: 126.8389 },
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
              schema: { $ref: '#/components/schemas/CgvTimetableResponse' },
            },
          },
        },
        '500': {
          description: 'CGV API 호출 실패',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
};
