/**
 * OpenAPI 컴포넌트 스키마 정의 (롯데마트)
 */

export const OPENAPI_LOTTEMART_COMPONENT_SCHEMAS = {
  LotteMartStore: {
    type: 'object',
    properties: {
      area: { type: 'string', example: '서울' },
      storeCode: { type: 'string', example: '2301' },
      storeName: { type: 'string', example: '강변점' },
      brandVariant: { type: 'string', example: 'lottemart' },
      address: { type: 'string', example: '서울 광진구 광나루로 56길 85 테크노마트 B2' },
      phone: { type: 'string', example: '02-3424-2502' },
      openTime: { type: 'string', example: '10:00~23:00' },
      closedDays: { type: 'string', example: '03/08(일), 03/22(일)' },
      parkingType: { type: 'string', example: '유료' },
      parkingDetails: { type: 'string', example: '최초 무료주차 : 1시간' },
      detailUrl: { type: 'string', example: '/mobiledowa/market/detail_shop.asp?werks=2301' },
      latitude: { type: 'number', format: 'float', example: 37.5354 },
      longitude: { type: 'number', format: 'float', example: 127.0958 },
      distanceM: { type: 'number', nullable: true, example: 530 },
    },
  },
  LotteMartProduct: {
    type: 'object',
    properties: {
      area: { type: 'string', example: '서울' },
      storeCode: { type: 'string', example: '2301' },
      storeName: { type: 'string', example: '강변점' },
      keyword: { type: 'string', example: '콜라' },
      productName: { type: 'string', example: '코카콜라' },
      barcode: { type: 'string', example: '8801094011307' },
      spec: { type: 'string', example: '1.2L' },
      manufacturer: { type: 'string', example: '코카콜라음료 주식회사' },
      price: { type: 'integer', example: 2980 },
      stockQuantity: { type: 'integer', example: 20 },
    },
  },
  LotteMartStoreSearchResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          stores: {
            type: 'array',
            items: { $ref: '#/components/schemas/LotteMartStore' },
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
  LotteMartProductSearchResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          products: {
            type: 'array',
            items: { $ref: '#/components/schemas/LotteMartProduct' },
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
} as const;
