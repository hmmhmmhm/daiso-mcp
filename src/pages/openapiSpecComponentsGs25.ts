/**
 * OpenAPI 컴포넌트 스키마 정의 (GS25)
 */

export const OPENAPI_GS25_COMPONENT_SCHEMAS = {
  Gs25Store: {
    type: 'object',
    properties: {
      storeCode: { type: 'string', example: 'VE463' },
      storeName: { type: 'string', example: '강남역점' },
      address: { type: 'string', example: '서울특별시 강남구 강남대로 396' },
      phone: { type: 'string', example: '02-1234-5678' },
      latitude: { type: 'number', format: 'float', example: 37.4982 },
      longitude: { type: 'number', format: 'float', example: 127.0276 },
      realStockQuantity: { type: 'integer', example: 3 },
      distanceM: { type: 'number', nullable: true, example: 120 },
      propertyNames: {
        type: 'array',
        items: { type: 'string' },
        example: ['반값택배픽업', '와인25플러스'],
      },
    },
  },
  Gs25ProductCandidate: {
    type: 'object',
    properties: {
      name: { type: 'string', example: '오리온)오감자50G' },
      sellPrice: { type: 'integer', nullable: true, example: 1700 },
      matchedStoreCount: { type: 'integer', example: 120 },
      inStockStoreCount: { type: 'integer', example: 42 },
      totalStockQuantity: { type: 'integer', example: 110 },
    },
  },
  Gs25StoreSearchResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          stores: {
            type: 'array',
            items: { $ref: '#/components/schemas/Gs25Store' },
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
  Gs25ProductSearchResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          products: {
            type: 'array',
            items: { $ref: '#/components/schemas/Gs25ProductCandidate' },
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
  Gs25InventoryResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          keyword: { type: 'string', example: '오감자' },
          product: {
            type: 'object',
            properties: {
              name: { type: 'string', nullable: true, example: '오리온)오감자50G' },
              sellPrice: { type: 'integer', nullable: true, example: 1700 },
            },
          },
          inventory: {
            type: 'object',
            properties: {
              totalStoreCount: { type: 'integer', example: 17684 },
              matchedStoreCount: { type: 'integer', example: 100 },
              inStockStoreCount: { type: 'integer', example: 35 },
              totalStockQuantity: { type: 'integer', example: 90 },
              stores: {
                type: 'array',
                items: { $ref: '#/components/schemas/Gs25Store' },
              },
            },
          },
        },
      },
    },
  },
} as const;
