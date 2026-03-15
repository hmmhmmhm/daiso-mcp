/**
 * OpenAPI 컴포넌트 스키마 정의
 */

import { OPENAPI_CGV_COMPONENT_SCHEMAS } from './openapiSpecComponentsCgv.js';
import { OPENAPI_CU_COMPONENT_SCHEMAS } from './openapiSpecComponentsCu.js';
import { OPENAPI_EMART24_COMPONENT_SCHEMAS } from './openapiSpecComponentsEmart24.js';
import { OPENAPI_GS25_COMPONENT_SCHEMAS } from './openapiSpecComponentsGs25.js';
import { OPENAPI_LOTTECINEMA_COMPONENT_SCHEMAS } from './openapiSpecComponentsLottecinema.js';
import { OPENAPI_LOTTEMART_COMPONENT_SCHEMAS } from './openapiSpecComponentsLotteMart.js';
import { OPENAPI_SEVENELEVEN_COMPONENT_SCHEMAS } from './openapiSpecComponentsSeveneleven.js';

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
              example: 'https://cdn.daisomall.co.kr/...',
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
        InventoryProduct: {
          type: 'object',
          description: '재고 응답에 포함되는 상품 요약 정보',
          properties: {
            id: { type: 'string', description: '제품 ID' },
            name: { type: 'string', description: '제품명' },
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
                product: { $ref: '#/components/schemas/InventoryProduct' },
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
            imageUrl: {
              type: 'string',
              example: 'https://image.oliveyoung.co.kr/uploads/images/goods/10/0000/0020/A00000020061401ko.jpg',
            },
            priceToPay: { type: 'integer', example: 32130 },
            originalPrice: { type: 'integer', example: 51000 },
            discountRate: { type: 'integer', example: 37 },
            o2oStockFlag: { type: 'boolean', description: '올리브영 원본 재고 가능 플래그', example: true },
            o2oRemainQuantity: { type: 'integer', description: '올리브영 원본 잔여 수량 필드. 0이어도 재고가 있을 수 있음', example: 0 },
            inStock: { type: 'boolean', description: '현재 조회한 주변 매장 기준 재고 여부. storeInventory가 있으면 그 결과를 우선 반영', example: true },
            stockStatus: { type: 'string', enum: ['in_stock', 'out_of_stock'], example: 'in_stock' },
            stockSource: { type: 'string', enum: ['global_search', 'nearby_store'], example: 'nearby_store' },
            storeInventory: { $ref: '#/components/schemas/OliveyoungProductStoreInventory' },
          },
        },
        OliveyoungStockStore: {
          type: 'object',
          description: '올리브영 상품별 매장 재고 상태',
          properties: {
            storeCode: { type: 'string', example: 'B040' },
            storeName: { type: 'string', example: '안산중앙역점' },
            address: { type: 'string', example: '경기도 안산시 단원구 고잔2길 65 1층' },
            latitude: { type: 'number', format: 'float', example: 37.3177184 },
            longitude: { type: 'number', format: 'float', example: 126.8385857 },
            distance: { type: 'number', format: 'float', example: 0.07 },
            pickupYn: { type: 'boolean', example: true },
            salesStoreYn: { type: 'boolean', example: true },
            remainQuantity: { type: 'integer', example: 3 },
            o2oRemainQuantity: { type: 'integer', example: 2 },
            stockStatus: { type: 'string', enum: ['in_stock', 'out_of_stock', 'not_sold'], example: 'in_stock' },
            stockLabel: { type: 'string', example: '재고 3개' },
            openYn: { type: 'boolean', example: true },
          },
        },
        OliveyoungProductStoreInventory: {
          type: 'object',
          properties: {
            totalCount: { type: 'integer', example: 1 },
            inStockCount: { type: 'integer', example: 1 },
            outOfStockCount: { type: 'integer', example: 0 },
            notSoldCount: { type: 'integer', example: 0 },
            stores: {
              type: 'array',
              items: { $ref: '#/components/schemas/OliveyoungStockStore' },
            },
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
        OliveyoungProductSearchResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                keyword: { type: 'string', example: '마스크팩' },
                count: { type: 'integer', example: 2 },
                products: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/OliveyoungProduct' },
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                page: { type: 'integer' },
                pageSize: { type: 'integer' },
                nextPage: { type: 'boolean' },
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
                    stockCheckedCount: { type: 'integer' },
                    stockUncheckedCount: { type: 'integer' },
                    inStockCount: { type: 'integer' },
                    outOfStockCount: { type: 'integer' },
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
        ...OPENAPI_CU_COMPONENT_SCHEMAS,
    ...OPENAPI_EMART24_COMPONENT_SCHEMAS,
    ...OPENAPI_LOTTEMART_COMPONENT_SCHEMAS,
    ...OPENAPI_GS25_COMPONENT_SCHEMAS,
        ...OPENAPI_SEVENELEVEN_COMPONENT_SCHEMAS,
        ...OPENAPI_LOTTECINEMA_COMPONENT_SCHEMAS,
        ...OPENAPI_CGV_COMPONENT_SCHEMAS,
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
        ActionQueryResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              additionalProperties: true,
              description: '대상 엔드포인트가 반환한 data 객체',
            },
            meta: {
              type: 'object',
              additionalProperties: true,
              description: '대상 엔드포인트가 반환한 meta 객체',
            },
          },
        },
      },
};
