/**
 * OpenAPI 컴포넌트 스키마 정의 (CU)
 */

export const OPENAPI_CU_COMPONENT_SCHEMAS = {
  CuStore: {
    type: 'object',
    description: 'CU 매장 정보',
    properties: {
      storeCode: { type: 'string', example: '28376' },
      storeName: { type: 'string', example: '중앙하이츠빌점' },
      phone: { type: 'string', example: '0315088023' },
      address: { type: 'string', example: '경기도 안산시 단원구 안산천서로 23' },
      latitude: { type: 'number', format: 'float', example: 37.318482 },
      longitude: { type: 'number', format: 'float', example: 126.841838 },
      distanceM: { type: 'number', example: 97 },
      stock: { type: 'integer', nullable: true, example: 10 },
      deliveryYn: { type: 'boolean', example: true },
      pickupYn: { type: 'boolean', example: false },
      reserveYn: { type: 'boolean', example: false },
    },
  },
  CuInventoryItem: {
    type: 'object',
    description: 'CU 재고 검색 상품',
    properties: {
      itemCode: { type: 'string', example: '8801728108946' },
      itemName: { type: 'string', example: '바삭한 감자칩' },
      price: { type: 'integer', example: 1700 },
      pickupYn: { type: 'boolean', example: true },
      deliveryYn: { type: 'boolean', example: true },
      reserveYn: { type: 'boolean', example: false },
    },
  },
  CuStoreSearchResponse: {
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
          keyword: { type: 'string' },
          stores: {
            type: 'array',
            items: { $ref: '#/components/schemas/CuStore' },
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
  CuInventoryResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          keyword: { type: 'string', example: '과자' },
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
                items: { $ref: '#/components/schemas/CuStore' },
              },
            },
          },
          inventory: {
            type: 'object',
            properties: {
              totalCount: { type: 'integer' },
              spellModifyYn: { type: 'string', example: 'Y' },
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/CuInventoryItem' },
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
} as const;
