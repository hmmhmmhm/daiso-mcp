/**
 * OpenAPI 컴포넌트 스키마 정의
 */

export const OPENAPI_COMPONENTS = {
  schemas: {
        Product: {
          type: 'object',
          description: '제품 정보',
          properties: {
            id: { type: 'string', description: '제품 ID', example: '1234567890' },
            name: { type: 'string', description: '제품명', example: 'PP 수납박스 대형' },
            price: { type: 'integer', description: '가격 (원)', example: 5000 },
            imageUrl: {
              type: 'string',
              description: '제품 이미지 URL',
              example: 'https://img.daisomall.co.kr/...',
            },
            soldOut: { type: 'boolean', description: '품절 여부', example: false },
            isNew: { type: 'boolean', description: '신상품 여부', example: false },
            pickupAvailable: { type: 'boolean', description: '매장 픽업 가능 여부', example: true },
          },
        },
        ProductDetail: {
          type: 'object',
          description: '제품 상세 정보',
          properties: {
            id: { type: 'string', description: '제품 ID' },
            name: { type: 'string', description: '제품명' },
            price: { type: 'integer', description: '가격 (원)' },
            currency: { type: 'string', description: '통화', example: 'KRW' },
            imageUrl: { type: 'string', description: '제품 이미지 URL' },
            brand: { type: 'string', description: '브랜드명' },
            soldOut: { type: 'boolean', description: '품절 여부' },
            isNew: { type: 'boolean', description: '신상품 여부' },
          },
        },
        Store: {
          type: 'object',
          description: '매장 정보',
          properties: {
            name: { type: 'string', description: '매장명', example: '다이소 강남역점' },
            phone: { type: 'string', description: '전화번호', example: '02-1234-5678' },
            address: {
              type: 'string',
              description: '주소',
              example: '서울특별시 강남구 강남대로 123',
            },
            lat: { type: 'number', format: 'float', description: '위도', example: 37.4979 },
            lng: { type: 'number', format: 'float', description: '경도', example: 127.0276 },
            openTime: { type: 'string', description: '영업 시작 시간', example: '10:00' },
            closeTime: { type: 'string', description: '영업 종료 시간', example: '22:00' },
            options: {
              type: 'object',
              description: '매장 옵션',
              properties: {
                parking: { type: 'boolean', description: '주차 가능 여부' },
                pickup: { type: 'boolean', description: '픽업 가능 여부' },
                taxFree: { type: 'boolean', description: '면세 가능 여부' },
              },
            },
          },
        },
        StoreInventory: {
          type: 'object',
          description: '매장 재고 정보',
          properties: {
            storeCode: { type: 'string', description: '매장 코드', example: 'ST001' },
            storeName: { type: 'string', description: '매장명', example: '다이소 강남역점' },
            address: { type: 'string', description: '주소' },
            distance: { type: 'string', description: '거리', example: '0.5km' },
            quantity: { type: 'integer', description: '재고 수량', example: 12 },
            options: {
              type: 'object',
              properties: {
                parking: { type: 'boolean' },
                pickup: { type: 'boolean' },
              },
            },
          },
        },
        ProductSearchResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                products: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer', description: '전체 결과 수' },
                page: { type: 'integer', description: '현재 페이지' },
                pageSize: { type: 'integer', description: '페이지당 결과 수' },
              },
            },
          },
        },
        ProductDetailResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { $ref: '#/components/schemas/ProductDetail' },
          },
        },
        StoreSearchResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                stores: { type: 'array', items: { $ref: '#/components/schemas/Store' } },
              },
            },
            meta: {
              type: 'object',
              properties: { total: { type: 'integer', description: '전체 결과 수' } },
            },
          },
        },
        InventoryResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                productId: { type: 'string', description: '제품 ID' },
                location: {
                  type: 'object',
                  properties: {
                    latitude: { type: 'number', format: 'float' },
                    longitude: { type: 'number', format: 'float' },
                  },
                },
                onlineStock: { type: 'integer', description: '온라인 재고 수량', example: 150 },
                storeInventory: {
                  type: 'object',
                  properties: {
                    totalStores: { type: 'integer', description: '전체 매장 수' },
                    inStockCount: { type: 'integer', description: '재고 있는 매장 수' },
                    stores: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/StoreInventory' },
                    },
                  },
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                page: { type: 'integer' },
                pageSize: { type: 'integer' },
              },
            },
          },
        },
        OliveyoungStore: {
          type: 'object',
          description: '올리브영 매장 정보',
          properties: {
            storeCode: { type: 'string', example: 'D176' },
            storeName: { type: 'string', example: '올리브영 명동 타운' },
            address: { type: 'string', example: '서울특별시 중구 명동길 53' },
            latitude: { type: 'number', format: 'float', example: 37.56409158 },
            longitude: { type: 'number', format: 'float', example: 126.9851771 },
            pickupYn: { type: 'boolean', example: false },
            o2oRemainQuantity: { type: 'integer', example: 0 },
          },
        },
        OliveyoungProduct: {
          type: 'object',
          description: '올리브영 상품 재고 정보',
          properties: {
            goodsNumber: { type: 'string', example: 'A000000200614' },
            goodsName: { type: 'string', example: '달바 퍼플 톤업 선크림 듀오 기획' },
            priceToPay: { type: 'integer', example: 32130 },
            originalPrice: { type: 'integer', example: 51000 },
            discountRate: { type: 'integer', example: 37 },
            o2oStockFlag: { type: 'boolean', example: true },
            o2oRemainQuantity: { type: 'integer', example: 0 },
          },
        },
        OliveyoungStoreSearchResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                stores: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/OliveyoungStore' },
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                page: { type: 'integer' },
                pageSize: { type: 'integer' },
              },
            },
          },
        },
        OliveyoungInventoryResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                keyword: { type: 'string', example: '선크림' },
                location: {
                  type: 'object',
                  properties: {
                    latitude: { type: 'number', format: 'float' },
                    longitude: { type: 'number', format: 'float' },
                  },
                },
                nearbyStores: {
                  type: 'object',
                  properties: {
                    totalCount: { type: 'integer' },
                    stores: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/OliveyoungStore' },
                    },
                  },
                },
                inventory: {
                  type: 'object',
                  properties: {
                    totalCount: { type: 'integer' },
                    nextPage: { type: 'boolean' },
                    products: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/OliveyoungProduct' },
                    },
                  },
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                page: { type: 'integer' },
                pageSize: { type: 'integer' },
              },
            },
          },
        },
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
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: '에러 코드', example: 'MISSING_QUERY' },
                message: {
                  type: 'string',
                  description: '에러 메시지',
                  example: '검색어(q)를 입력해주세요.',
                },
              },
            },
          },
        },
      },
};
