/**
 * OpenAPI 컴포넌트 스키마 정의 (세븐일레븐)
 */

export const OPENAPI_SEVENELEVEN_COMPONENT_SCHEMAS = {
  SevenElevenProduct: {
    type: 'object',
    properties: {
      itemCode: { type: 'string', example: '8801056252243' },
      itemName: { type: 'string', example: '칠성)핫식스더킹퍼플500ml' },
      salePrice: { type: 'integer', nullable: true, example: 3000 },
      imageUrl: { type: 'string', nullable: true, example: '' },
    },
  },
  SevenElevenStockError: {
    type: 'object',
    nullable: true,
    properties: {
      cause: { type: 'string', example: 'api' },
      httpStatus: { type: 'integer', nullable: true, example: 400 },
      code: { type: 'integer', nullable: true, example: 501 },
      message: { type: 'string', example: 'RSA 복호화 실패' },
      raw: { type: 'string', nullable: true },
    },
  },
  SevenElevenStoreInventory: {
    type: 'object',
    properties: {
      storeCode: { type: 'string', example: '54928' },
      storeName: { type: 'string', example: '안산중앙일번가점' },
      address: { type: 'string', example: '경기 안산시 단원구 중앙대로 907 2동 2121호' },
      latitude: { type: 'number', format: 'float', example: 37.317371500357 },
      longitude: { type: 'number', format: 'float', example: 126.837004318586 },
      stockQuantity: { type: 'integer', example: 14 },
      isSoldOut: { type: 'boolean', example: false },
      distanceM: { type: 'integer', nullable: true, example: 100 },
    },
  },
  SevenElevenInventoryResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          keyword: { type: 'string', example: '핫식스' },
          storeKeyword: { type: 'string', example: '안산 중앙역' },
          product: {
            anyOf: [
              { $ref: '#/components/schemas/SevenElevenProduct' },
              { type: 'null' },
            ],
          },
          stockAvailable: { type: 'boolean', example: true },
          stockError: { $ref: '#/components/schemas/SevenElevenStockError' },
          note: {
            type: 'string',
            example: '실시간 재고 데이터가 포함되어 있습니다.',
          },
          inventory: {
            type: 'object',
            properties: {
              totalStoreCount: { type: 'integer', example: 4 },
              inStockStoreCount: { type: 'integer', example: 3 },
              count: { type: 'integer', example: 4 },
              stores: {
                type: 'array',
                items: { $ref: '#/components/schemas/SevenElevenStoreInventory' },
              },
            },
          },
        },
      },
      meta: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 4 },
          pageSize: { type: 'integer', example: 10 },
        },
      },
    },
  },
} as const;
