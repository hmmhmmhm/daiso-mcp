/**
 * OpenAPI 경로 정의 (다이소/올리브영)
 */

export const OPENAPI_PATHS_DAISO_OLIVEYOUNG = {
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
            '키워드 또는 지역으로 다이소 매장을 검색합니다. keyword 또는 sido 중 하나는 필수입니다. 이 응답에는 storeCode가 포함되지 않을 수 있으므로, 진열 위치 조회에 필요한 storeCode는 /api/daiso/inventory 응답에서 확인하세요.',
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
            '특정 제품의 온라인 재고와 매장별 재고를 확인합니다. storeCode 없이 productId만으로 호출할 수 있으며, 진열 위치 조회에 필요한 storeCode도 이 응답의 각 매장에서 확인할 수 있습니다. 위치 정보를 제공하면 가까운 매장 순으로 정렬됩니다.',
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
      '/api/daiso/display-location': {
        get: {
          operationId: 'getDisplayLocation',
          summary: '진열 위치 조회',
          description: '특정 상품의 매장 내 진열 위치(구역/층)를 조회합니다.',
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
              name: 'storeCode',
              in: 'query',
              required: true,
              description: '매장 코드 (재고 조회 결과의 storeCode 값)',
              schema: { type: 'string' },
              example: '04515',
            },
          ],
          responses: {
            '200': {
              description: '조회 성공',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          productId: { type: 'string', example: '1234567890' },
                          storeCode: { type: 'string', example: '04515' },
                          hasLocation: { type: 'boolean', example: true },
                          locations: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                zoneNo: { type: 'string', example: '60' },
                                stairNo: { type: 'string', example: '2' },
                                storeErp: { type: 'string', example: '04515' },
                              },
                            },
                          },
                          message: { type: 'string', nullable: true, example: null },
                        },
                      },
                    },
                  },
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
            '500': {
              description: '진열 위치 조회 실패',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/oliveyoung/stores': {
        get: {
          operationId: 'oliveyoungFindStores',
          summary: '올리브영 매장 검색',
          description: '위치(위도/경도)와 키워드로 올리브영 매장을 검색합니다.',
          parameters: [
            {
              name: 'keyword',
              in: 'query',
              required: false,
              description: '매장명 또는 지역 키워드 (예: 명동, 강남)',
              schema: { type: 'string' },
              example: '명동',
            },
            {
              name: 'lat',
              in: 'query',
              required: false,
              description: '위도 (기본값: 서울 시청 37.5665)',
              schema: { type: 'number', format: 'float', default: 37.5665 },
            },
            {
              name: 'lng',
              in: 'query',
              required: false,
              description: '경도 (기본값: 서울 시청 126.978)',
              schema: { type: 'number', format: 'float', default: 126.978 },
            },
            {
              name: 'pageIdx',
              in: 'query',
              required: false,
              description: '매장 검색 페이지 번호',
              schema: { type: 'integer', default: 1, minimum: 1 },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: '최대 결과 수',
              schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            '200': {
              description: '검색 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OliveyoungStoreSearchResponse' },
                },
              },
            },
            '500': {
              description: '올리브영 API 호출 실패',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/oliveyoung/inventory': {
        get: {
          operationId: 'oliveyoungCheckInventory',
          summary: '올리브영 재고 확인',
          description:
            '상품 키워드로 올리브영 재고를 검색하고 주변 매장 정보를 함께 조회합니다. 상위 상품에는 storeInventory가 포함되며 매장별 재고 수량/품절/미판매 상태를 확인할 수 있습니다.',
          parameters: [
            {
              name: 'keyword',
              in: 'query',
              required: true,
              description: '재고를 확인할 상품 키워드',
              schema: { type: 'string' },
              example: '선크림',
            },
            {
              name: 'lat',
              in: 'query',
              required: false,
              description: '위도 (기본값: 서울 시청 37.5665)',
              schema: { type: 'number', format: 'float', default: 37.5665 },
            },
            {
              name: 'lng',
              in: 'query',
              required: false,
              description: '경도 (기본값: 서울 시청 126.978)',
              schema: { type: 'number', format: 'float', default: 126.978 },
            },
            {
              name: 'storeKeyword',
              in: 'query',
              required: false,
              description: '주변 매장 필터 키워드',
              schema: { type: 'string' },
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              description: '상품 검색 페이지 번호',
              schema: { type: 'integer', default: 1, minimum: 1 },
            },
            {
              name: 'size',
              in: 'query',
              required: false,
              description: '페이지당 결과 수',
              schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
            },
            {
              name: 'sort',
              in: 'query',
              required: false,
              description: '정렬 코드',
              schema: { type: 'string', default: '01' },
            },
            {
              name: 'includeSoldOut',
              in: 'query',
              required: false,
              description: '품절 포함 여부 (true/false)',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            '200': {
              description: '조회 성공',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OliveyoungInventoryResponse' },
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
            '500': {
              description: '올리브영 API 호출 실패',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
};
