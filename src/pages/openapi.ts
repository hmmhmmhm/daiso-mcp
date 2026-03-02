/**
 * OpenAPI 스펙 페이지
 *
 * ChatGPT GPTs 등록을 위한 OpenAPI 3.1 스펙을 제공합니다.
 */

/**
 * OpenAPI 스펙 생성
 */
export function generateOpenApiSpec(baseUrl: string): object {
  return {
    openapi: '3.1.0',
    info: {
      title: '다이소 MCP API',
      description: `다이소 제품 검색, 매장 찾기, 재고 확인을 위한 API입니다.

## 주요 기능
- 🔍 **제품 검색**: 키워드로 다이소 제품 검색
- 🏪 **매장 찾기**: 지역/키워드로 매장 검색
- 📦 **재고 확인**: 온라인 및 오프라인 매장 재고 조회

## 사용 팁
1. 한글 검색어는 URL 인코딩이 자동 처리됩니다
2. 재고 확인 시 먼저 제품 검색으로 제품 ID를 확인하세요
3. 위치 기반 재고 조회 시 lat, lng 파라미터를 활용하세요`,
      version: '1.0.0',
      contact: {
        name: 'GitHub Repository',
        url: 'https://github.com/hmmhmmhm/daiso-mcp',
      },
    },
    servers: [{ url: baseUrl, description: 'Production Server' }],
    paths: {
      '/api/daiso/products': {
        get: {
          operationId: 'searchProducts',
          summary: '제품 검색',
          description:
            '키워드로 다이소 제품을 검색합니다. 수납박스, 펜, 정리함 등 다양한 키워드로 검색할 수 있습니다.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description: '검색 키워드 (예: 수납박스, 펜, 정리함)',
              schema: { type: 'string' },
              example: '수납박스',
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              description: '페이지 번호',
              schema: { type: 'integer', default: 1, minimum: 1 },
            },
            {
              name: 'pageSize',
              in: 'query',
              required: false,
              description: '페이지당 결과 수',
              schema: { type: 'integer', default: 30, minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            '200': {
              description: '검색 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProductSearchResponse' },
                },
              },
            },
            '400': {
              description: '잘못된 요청 (검색어 누락)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/daiso/products/{productId}': {
        get: {
          operationId: 'getProduct',
          summary: '제품 상세 정보',
          description: '제품 ID로 상세 정보를 조회합니다.',
          parameters: [
            {
              name: 'productId',
              in: 'path',
              required: true,
              description: '제품 ID (제품 검색 결과의 id 값)',
              schema: { type: 'string' },
              example: '1234567890',
            },
          ],
          responses: {
            '200': {
              description: '조회 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProductDetailResponse' },
                },
              },
            },
            '404': {
              description: '제품을 찾을 수 없음',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/daiso/stores': {
        get: {
          operationId: 'findStores',
          summary: '매장 찾기',
          description:
            '키워드 또는 지역으로 다이소 매장을 검색합니다. keyword 또는 sido 중 하나는 필수입니다.',
          parameters: [
            {
              name: 'keyword',
              in: 'query',
              required: false,
              description: '매장명 또는 주소 키워드 (예: 강남, 홍대, 안산)',
              schema: { type: 'string' },
              example: '강남',
            },
            {
              name: 'sido',
              in: 'query',
              required: false,
              description: '시/도 (예: 서울, 경기, 부산)',
              schema: { type: 'string' },
              example: '서울',
            },
            {
              name: 'gugun',
              in: 'query',
              required: false,
              description: '구/군 (예: 강남구, 마포구)',
              schema: { type: 'string' },
              example: '강남구',
            },
            {
              name: 'dong',
              in: 'query',
              required: false,
              description: '동 (예: 역삼동, 합정동)',
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: '최대 결과 수',
              schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            '200': {
              description: '검색 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StoreSearchResponse' },
                },
              },
            },
            '400': {
              description: '잘못된 요청 (필수 파라미터 누락)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/daiso/inventory': {
        get: {
          operationId: 'checkInventory',
          summary: '재고 확인',
          description:
            '특정 제품의 온라인 재고와 매장별 재고를 확인합니다. 위치 정보를 제공하면 가까운 매장 순으로 정렬됩니다.',
          parameters: [
            {
              name: 'productId',
              in: 'query',
              required: true,
              description: '제품 ID (제품 검색 결과의 id 값)',
              schema: { type: 'string' },
              example: '1234567890',
            },
            {
              name: 'lat',
              in: 'query',
              required: false,
              description: '위도 (기본값: 서울 시청 37.5665)',
              schema: { type: 'number', format: 'float', default: 37.5665 },
              example: 37.4979,
            },
            {
              name: 'lng',
              in: 'query',
              required: false,
              description: '경도 (기본값: 서울 시청 126.978)',
              schema: { type: 'number', format: 'float', default: 126.978 },
              example: 127.0276,
            },
            {
              name: 'keyword',
              in: 'query',
              required: false,
              description: '매장 검색어 (예: 안산, 강남)',
              schema: { type: 'string' },
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              description: '페이지 번호',
              schema: { type: 'integer', default: 1, minimum: 1 },
            },
            {
              name: 'pageSize',
              in: 'query',
              required: false,
              description: '페이지당 결과 수',
              schema: { type: 'integer', default: 30, minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            '200': {
              description: '조회 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/InventoryResponse' },
                },
              },
            },
            '400': {
              description: '잘못된 요청 (제품 ID 누락)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
    },
    components: {
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
    },
  };
}

/**
 * OpenAPI 스펙 응답 생성 (JSON)
 */
export function createOpenApiJsonResponse(baseUrl: string): Response {
  const spec = generateOpenApiSpec(baseUrl);

  return new Response(JSON.stringify(spec, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * OpenAPI 스펙 응답 생성 (YAML)
 */
export function createOpenApiYamlResponse(baseUrl: string): Response {
  const spec = generateOpenApiSpec(baseUrl);
  const yaml = jsonToYaml(spec);

  return new Response(yaml, {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * JSON을 YAML로 변환 (간단한 구현)
 */
function jsonToYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'boolean' || typeof obj === 'number') {
    return String(obj);
  }

  if (typeof obj === 'string') {
    // 여러 줄 문자열 처리
    if (obj.includes('\n')) {
      const lines = obj.split('\n');
      return '|\n' + lines.map((line) => spaces + '  ' + line).join('\n');
    }
    // 특수 문자가 포함된 경우 따옴표로 감싸기
    if (
      obj.includes(':') ||
      obj.includes('#') ||
      obj.includes("'") ||
      obj.includes('"') ||
      obj.includes('\\')
    ) {
      return JSON.stringify(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map((item) => `\n${spaces}- ${jsonToYaml(item, indent + 1).trimStart()}`).join('');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, value]) => {
        const yamlValue = jsonToYaml(value, indent + 1);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `\n${spaces}${key}:${yamlValue}`;
        }
        if (Array.isArray(value)) {
          return `\n${spaces}${key}:${yamlValue}`;
        }
        return `\n${spaces}${key}: ${yamlValue}`;
      })
      .join('');
  }

  return String(obj);
}
