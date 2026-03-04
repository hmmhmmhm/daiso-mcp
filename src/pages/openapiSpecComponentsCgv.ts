/**
 * OpenAPI CGV 컴포넌트 스키마 정의
 */

export const OPENAPI_CGV_COMPONENT_SCHEMAS = {
  CgvTheater: {
    type: 'object',
    properties: {
      theaterCode: { type: 'string', example: '0056' },
      theaterName: { type: 'string', example: 'CGV강남' },
      regionCode: { type: 'string', example: '01' },
    },
  },
  CgvMovie: {
    type: 'object',
    properties: {
      movieCode: { type: 'string', example: '200001' },
      movieName: { type: 'string', example: '테스트 영화' },
      rating: { type: 'string', example: '12' },
    },
  },
  CgvTimetable: {
    type: 'object',
    properties: {
      scheduleId: { type: 'string', example: 'SCH1' },
      movieCode: { type: 'string', example: '200001' },
      movieName: { type: 'string', example: '테스트 영화' },
      theaterCode: { type: 'string', example: '0056' },
      theaterName: { type: 'string', example: 'CGV강남' },
      playDate: { type: 'string', example: '20260304' },
      startTime: { type: 'string', example: '09:30' },
      endTime: { type: 'string', example: '11:20' },
      totalSeats: { type: 'integer', example: 150 },
      remainingSeats: { type: 'integer', example: 42 },
    },
  },
  CgvTheaterSearchResponse: {
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
              regionCode: { type: 'string', nullable: true },
            },
          },
          theaters: {
            type: 'array',
            items: { $ref: '#/components/schemas/CgvTheater' },
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
  CgvMovieSearchResponse: {
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
              theaterCode: { type: 'string', nullable: true },
            },
          },
          movies: {
            type: 'array',
            items: { $ref: '#/components/schemas/CgvMovie' },
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
  CgvTimetableResponse: {
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
              theaterCode: { type: 'string', nullable: true },
              movieCode: { type: 'string', nullable: true },
            },
          },
          timetable: {
            type: 'array',
            items: { $ref: '#/components/schemas/CgvTimetable' },
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
