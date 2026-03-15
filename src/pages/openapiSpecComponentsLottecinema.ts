/**
 * OpenAPI 롯데시네마 컴포넌트 스키마 정의
 */

export const OPENAPI_LOTTECINEMA_COMPONENT_SCHEMAS = {
  LotteCinemaTheater: {
    type: 'object',
    properties: {
      theaterId: { type: 'string', example: '1016' },
      theaterName: { type: 'string', example: '월드타워' },
      regionCode: { type: 'string', example: '1' },
      regionDetailCode: { type: 'string', example: '0001' },
      address: { type: 'string', example: '서울 송파구 올림픽로 300' },
      latitude: { type: 'number', format: 'float', example: 37.5132941 },
      longitude: { type: 'number', format: 'float', example: 127.104215 },
      distanceKm: { type: 'number', format: 'float', example: 0.5 },
    },
  },
  LotteCinemaResolvedLocation: {
    type: 'object',
    properties: {
      keyword: { type: 'string', nullable: true, example: '안산 중앙역' },
      latitude: { type: 'number', format: 'float', nullable: true, example: 37.3172 },
      longitude: { type: 'number', format: 'float', nullable: true, example: 126.839 },
      geocodeUsed: { type: 'boolean', example: true },
      formattedAddress: { type: 'string', nullable: true, example: '대한민국 경기도 안산시 단원구 고잔동 535' },
    },
  },
  LotteCinemaMovie: {
    type: 'object',
    properties: {
      movieId: { type: 'string', example: '23816' },
      movieName: { type: 'string', example: '왕과 사는 남자' },
      rating: { type: 'string', example: '12세이상관람가' },
      durationMinutes: { type: 'integer', example: 127 },
      releaseDate: { type: 'string', example: '2026-03-10' },
    },
  },
  LotteCinemaShowtime: {
    type: 'object',
    properties: {
      scheduleId: { type: 'string', example: '20260310-1016-1201-1' },
      theaterId: { type: 'string', example: '1016' },
      theaterName: { type: 'string', example: '월드타워' },
      movieId: { type: 'string', example: '23816' },
      movieName: { type: 'string', example: '왕과 사는 남자' },
      screenId: { type: 'string', example: '1201' },
      screenName: { type: 'string', example: '1관 샤롯데' },
      playDate: { type: 'string', example: '20260310' },
      startTime: { type: 'string', example: '10:40' },
      endTime: { type: 'string', example: '12:47' },
      totalSeats: { type: 'integer', example: 32 },
      bookedSeats: { type: 'integer', example: 28 },
      remainingSeats: { type: 'integer', example: 4 },
    },
  },
  LotteCinemaTheaterSearchResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          keyword: { type: 'string', nullable: true },
          latitude: { type: 'number', format: 'float', nullable: true },
          longitude: { type: 'number', format: 'float', nullable: true },
          geocodeUsed: { type: 'boolean' },
          formattedAddress: { type: 'string', nullable: true },
          playDate: { type: 'string' },
          theaters: {
            type: 'array',
            items: { $ref: '#/components/schemas/LotteCinemaTheater' },
          },
        },
      },
      meta: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          pageSize: { type: 'integer' },
        },
      },
    },
  },
  LotteCinemaMovieListResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          playDate: { type: 'string' },
          filters: {
            type: 'object',
            properties: {
              theaterId: { type: 'string', nullable: true },
              movieId: { type: 'string', nullable: true },
              keyword: { type: 'string', nullable: true },
              latitude: { type: 'number', format: 'float', nullable: true },
              longitude: { type: 'number', format: 'float', nullable: true },
            },
          },
          resolvedTheater: {
            anyOf: [{ $ref: '#/components/schemas/LotteCinemaTheater' }, { type: 'null' }],
          },
          theaters: {
            type: 'array',
            items: { $ref: '#/components/schemas/LotteCinemaTheater' },
          },
          movies: {
            type: 'array',
            items: { $ref: '#/components/schemas/LotteCinemaMovie' },
          },
          showtimes: {
            type: 'array',
            items: { $ref: '#/components/schemas/LotteCinemaShowtime' },
          },
        },
      },
      meta: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
        },
      },
    },
  },
  LotteCinemaSeatListResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          playDate: { type: 'string' },
          filters: {
            type: 'object',
            properties: {
              theaterId: { type: 'string', nullable: true },
              movieId: { type: 'string', nullable: true },
              keyword: { type: 'string', nullable: true },
              latitude: { type: 'number', format: 'float', nullable: true },
              longitude: { type: 'number', format: 'float', nullable: true },
            },
          },
          resolvedTheater: {
            anyOf: [{ $ref: '#/components/schemas/LotteCinemaTheater' }, { type: 'null' }],
          },
          seats: {
            type: 'array',
            items: { $ref: '#/components/schemas/LotteCinemaShowtime' },
          },
        },
      },
      meta: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          pageSize: { type: 'integer' },
        },
      },
    },
  },
} as const;
