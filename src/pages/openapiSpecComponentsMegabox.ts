/**
 * OpenAPI 컴포넌트 스키마 정의 (메가박스)
 */

export const OPENAPI_MEGABOX_COMPONENT_SCHEMAS = {
        MegaboxTheater: {
          type: 'object',
          properties: {
            theaterId: { type: 'string', example: '1372' },
            theaterName: { type: 'string', example: '강남' },
            address: { type: 'string', example: '서울특별시 강남구 강남대로 438' },
            latitude: { type: 'number', format: 'float', example: 37.4982 },
            longitude: { type: 'number', format: 'float', example: 127.0264 },
            distanceKm: { type: 'number', format: 'float', example: 0.5 },
          },
        },
        MegaboxShowtime: {
          type: 'object',
          properties: {
            scheduleId: { type: 'string', example: '2603041372011' },
            movieId: { type: 'string', example: '25104500' },
            movieName: { type: 'string', example: '미키 17' },
            theaterId: { type: 'string', example: '1372' },
            theaterName: { type: 'string', example: '강남' },
            playDate: { type: 'string', example: '20260304' },
            startTime: { type: 'string', example: '09:30' },
            endTime: { type: 'string', example: '11:20' },
            totalSeats: { type: 'integer', example: 120 },
            remainingSeats: { type: 'integer', example: 42 },
          },
        },
        MegaboxTheaterSearchResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                location: {
                  type: 'object',
                  properties: {
                    latitude: { type: 'number', format: 'float' },
                    longitude: { type: 'number', format: 'float' },
                  },
                },
                playDate: { type: 'string' },
                areaCode: { type: 'string' },
                theaters: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MegaboxTheater' },
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
        MegaboxMovieListResponse: {
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
                    areaCode: { type: 'string' },
                  },
                },
                theaters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      theaterId: { type: 'string' },
                      theaterName: { type: 'string' },
                    },
                  },
                },
                movies: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      movieId: { type: 'string' },
                      movieName: { type: 'string' },
                      movieStatus: { type: 'string' },
                    },
                  },
                },
                showtimes: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MegaboxShowtime' },
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
        MegaboxSeatListResponse: {
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
                    areaCode: { type: 'string' },
                  },
                },
                seats: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MegaboxShowtime' },
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
};
