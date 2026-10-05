/** 디트릭스 공개 API 경로와 응답 스키마입니다. */
const text = { type: 'string' };
const integer = { type: 'integer' };
const cinema = {
  type: 'object',
  properties: {
    brandCode: text,
    cinemaCode: text,
    cinemaName: text,
    region: text,
    address: text,
  },
};
const movie = {
  type: 'object',
  properties: { movieCode: text, movieName: text, rating: text, runningMinutes: integer },
};
const showtime = {
  type: 'object',
  properties: {
    scheduleId: text,
    brandCode: text,
    cinemaCode: text,
    cinemaName: text,
    screenCode: text,
    screenName: text,
    movieCode: text,
    movieName: text,
    playDate: text,
    startTime: text,
    endTime: text,
    runningMinutes: integer,
    rating: text,
    totalSeats: { ...integer, nullable: true },
    remainingSeats: { ...integer, nullable: true },
    bookedSeats: { ...integer, nullable: true },
    planStatus: text,
  },
};
const query = (name: string, description: string, schema: object = text) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
});
const filters = [
  query('keyword', '극장명 부분 검색'),
  query('brandCode', '브랜드 코드. 미등록 극장을 조회할 때 cinemaCode와 함께 지정합니다.'),
];
const selector = [query('cinemaCode', '극장 코드 (예: 000067)'), ...filters];
const region = query('region', '광역 지역명. 극장명과 함께 지정하면 두 조건을 모두 적용합니다.');
const limit = query('limit', '최대 결과 수', { ...integer, minimum: 1, maximum: 200, default: 50 });
const timeout = query('timeoutMs', '원본 요청 제한 시간(ms)', {
  ...integer,
  minimum: 1,
  maximum: 60000,
  default: 15000,
});
const error = {
  description: '요청 조건 오류 또는 원본 조회 실패',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};
function responses(properties: object) {
  return {
    '200': {
      description: '조회 성공. 일부 극장 조회 실패는 failedCinemas에 표시합니다.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', const: true },
              data: { type: 'object', properties },
              meta: { type: 'object', properties: { total: integer, pageSize: integer } },
            },
          },
        },
      },
    },
    '400': error,
    '404': error,
    '500': error,
    '503': error,
  };
}
export const OPENAPI_PATHS_DTRYX = {
  '/api/dtryx/cinemas': {
    get: {
      operationId: 'dtryxListCinemas',
      summary: '디트릭스 독립·예술영화관 목록',
      description:
        '확인된 극장 카탈로그를 검색합니다. 전체 제휴 극장 목록이나 실시간 위치 정보는 아닙니다.',
      parameters: [...filters, region, limit],
      responses: responses({
        filters: { type: 'object' },
        count: integer,
        cinemas: { type: 'array', items: cinema },
      }),
    },
  },
  '/api/dtryx/movies': {
    get: {
      operationId: 'dtryxListNowShowing',
      summary: '디트릭스 극장 상영작 조회',
      description:
        'cinemaCode 또는 keyword가 필요합니다. 극장명 검색은 첫 번째 일치 극장을 선택합니다.',
      parameters: [
        ...selector,
        query('includePlayDates', '상영 가능한 날짜 포함', { type: 'boolean', default: false }),
        timeout,
      ],
      responses: responses({
        cinema,
        count: integer,
        movies: { type: 'array', items: movie },
        playDates: {
          type: 'array',
          items: {
            type: 'object',
            properties: { playDate: text, hidden: { type: 'boolean' }, rest: { type: 'boolean' } },
          },
        },
      }),
    },
  },
  '/api/dtryx/seats': {
    get: {
      operationId: 'dtryxGetRemainingSeats',
      summary: '디트릭스 상영시간표와 잔여 좌석 조회',
      description:
        '극장 조건이 없으면 카탈로그 전체를 조회합니다. 일부 실패는 failedCinemas에 표시하고 전체 실패는 503을 반환합니다.',
      parameters: [
        ...selector,
        region,
        query('movieName', '영화명 부분 일치'),
        query('playDate', 'YYYYMMDD 또는 YYYY-MM-DD. 기본값은 한국 날짜 기준 오늘입니다.'),
        limit,
        timeout,
      ],
      responses: responses({
        playDate: text,
        filters: { type: 'object' },
        searchedCinemaCount: integer,
        failedCinemas: { type: 'array', items: text },
        count: integer,
        showtimes: { type: 'array', items: showtime },
      }),
    },
  },
};
