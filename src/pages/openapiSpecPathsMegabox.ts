/**
 * OpenAPI 경로 정의 (메가박스)
 */

export const OPENAPI_PATHS_MEGABOX = {
      '/api/megabox/theaters': {
        get: {
          operationId: 'megaboxFindNearbyTheaters',
          summary: '메가박스 주변 지점 조회',
          description: '좌표 또는 위치 키워드 기준으로 메가박스 지점을 거리순으로 조회합니다. lat/lng가 없으면 keyword를 구글 지오코드로 보강할 수 있습니다.',
          parameters: [
            {
              name: 'keyword',
              in: 'query',
              required: false,
              description: '위치 키워드 (예: 안산 중앙역, 강남역)',
              schema: { type: 'string' },
            },
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
              schema: { type: 'string', example: '20260304' },
            },
            {
              name: 'areaCode',
              in: 'query',
              required: false,
              description: '지역 코드 (기본값: 11, 서울)',
              schema: { type: 'string', default: '11' },
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
                  schema: { $ref: '#/components/schemas/MegaboxTheaterSearchResponse' },
                },
              },
            },
            '500': {
              description: '메가박스 API 호출 실패',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/megabox/movies': {
        get: {
          operationId: 'megaboxListNowShowing',
          summary: '메가박스 영화/회차 목록 조회',
          description: '날짜, 지점, 영화 조건으로 메가박스 영화 및 상영 회차를 조회합니다. theaterId가 없고 keyword 또는 좌표가 있으면 가장 가까운 지점을 먼저 선택합니다.',
          parameters: [
            {
              name: 'playDate',
              in: 'query',
              required: false,
              description: '조회 날짜 (YYYYMMDD)',
              schema: { type: 'string', example: '20260304' },
            },
            {
              name: 'theaterId',
              in: 'query',
              required: false,
              description: '지점 ID (예: 1372)',
              schema: { type: 'string', example: '1372' },
            },
            {
              name: 'movieId',
              in: 'query',
              required: false,
              description: '영화 ID (예: 25104500)',
              schema: { type: 'string', example: '25104500' },
            },
            {
              name: 'keyword',
              in: 'query',
              required: false,
              description: '위치 키워드 (예: 안산 중앙역, 강남역)',
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
              name: 'areaCode',
              in: 'query',
              required: false,
              description: '지역 코드 (기본값: 11, 서울)',
              schema: { type: 'string', default: '11' },
            },
          ],
          responses: {
            '200': {
              description: '조회 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MegaboxMovieListResponse' },
                },
              },
            },
            '500': {
              description: '메가박스 API 호출 실패',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/megabox/seats': {
        get: {
          operationId: 'megaboxGetRemainingSeats',
          summary: '메가박스 잔여 좌석 조회',
          description: '영화/지점/날짜 조건으로 회차별 잔여 좌석 수를 조회합니다. theaterId가 없고 keyword 또는 좌표가 있으면 가장 가까운 지점을 먼저 선택합니다.',
          parameters: [
            {
              name: 'playDate',
              in: 'query',
              required: false,
              description: '조회 날짜 (YYYYMMDD)',
              schema: { type: 'string', example: '20260304' },
            },
            {
              name: 'theaterId',
              in: 'query',
              required: false,
              description: '지점 ID',
              schema: { type: 'string' },
            },
            {
              name: 'movieId',
              in: 'query',
              required: false,
              description: '영화 ID',
              schema: { type: 'string' },
            },
            {
              name: 'keyword',
              in: 'query',
              required: false,
              description: '위치 키워드 (예: 안산 중앙역, 강남역)',
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
              name: 'areaCode',
              in: 'query',
              required: false,
              description: '지역 코드 (기본값: 11, 서울)',
              schema: { type: 'string', default: '11' },
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
                  schema: { $ref: '#/components/schemas/MegaboxSeatListResponse' },
                },
              },
            },
            '500': {
              description: '메가박스 API 호출 실패',
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
