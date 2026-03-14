/**
 * OpenAPI 컴포넌트 스키마 정의 (이마트24)
 */

export const OPENAPI_EMART24_COMPONENT_SCHEMAS = {
  Emart24Store: {
    type: 'object',
    properties: {
      storeCode: { type: 'string', example: '28339' },
      storeName: { type: 'string', example: '강남스퀘어점' },
      address: { type: 'string', example: '서울특별시 강남구 강남대로 396' },
      phone: { type: 'string', example: '02-000-0000' },
      latitude: { type: 'number', format: 'float', example: 37.4982 },
      longitude: { type: 'number', format: 'float', example: 127.0276 },
      service24h: { type: 'boolean', example: true },
      distanceM: { type: 'number', nullable: true, example: 120 },
    },
  },
  Emart24Product: {
    type: 'object',
    properties: {
      pluCd: { type: 'string', example: '8800244010504' },
      goodsName: { type: 'string', example: '두바이초콜릿' },
      originPrice: { type: 'integer', example: 3500 },
      viewPrice: { type: 'integer', example: 3000 },
      category: { type: 'string', example: '간식' },
      kind: { type: 'string', example: '초콜릿' },
    },
  },
  Emart24StoreSearchResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          stores: {
            type: 'array',
            items: { $ref: '#/components/schemas/Emart24Store' },
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
  Emart24ProductSearchResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          products: {
            type: 'array',
            items: { $ref: '#/components/schemas/Emart24Product' },
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
  Emart24InventoryResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          keyword: { type: 'string', example: '고양이 츄르' },
          pluCd: { type: 'string', example: '8800244010504' },
          productCandidates: {
            type: 'array',
            items: { $ref: '#/components/schemas/Emart24Product' },
          },
          location: {
            type: 'object',
            nullable: true,
            properties: {
              latitude: { type: 'number', format: 'float' },
              longitude: { type: 'number', format: 'float' },
            },
          },
          storeFilters: {
            type: 'object',
            properties: {
              storeKeyword: { type: 'string', example: '안산 중앙역' },
              appliedStoreKeyword: { type: 'string', example: '안산중앙역' },
              area1: { type: 'string', example: '경기도' },
              area2: { type: 'string', example: '안산시' },
              service24h: { type: 'boolean', example: false },
              storeLimit: { type: 'integer', example: 10 },
              directBizNos: {
                type: 'array',
                items: { type: 'string', example: '28339' },
              },
            },
          },
          nearbyStores: {
            type: 'object',
            properties: {
              totalCount: { type: 'integer', example: 3 },
              stores: {
                type: 'array',
                items: { $ref: '#/components/schemas/Emart24Store' },
              },
            },
          },
          goodsInfo: { type: 'object', nullable: true },
          count: { type: 'integer', example: 1 },
          stores: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                bizNo: { type: 'string', example: '28339' },
                bizQty: { type: 'integer', example: 3 },
                storeName: { type: 'string', example: '강남스퀘어점' },
                address: { type: 'string' },
                phone: { type: 'string' },
                distanceM: { type: 'number', nullable: true, example: 120 },
              },
            },
          },
        },
      },
    },
  },
} as const;
