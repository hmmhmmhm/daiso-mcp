import { searchProducts } from './tools/searchProducts.js';
import { findStores } from './tools/findStores.js';
import { checkInventory } from './tools/checkInventory.js';
import { getPriceInfo } from './tools/getPriceInfo.js';

// CORS 헤더
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 사용 가능한 도구 목록
const tools = [
  {
    name: 'search_products',
    description: '다이소 제품을 검색합니다. 제품명, 카테고리, 가격대 등으로 검색할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색할 제품명 또는 키워드',
        },
        category: {
          type: 'string',
          description: '제품 카테고리 (선택사항)',
        },
        maxPrice: {
          type: 'number',
          description: '최대 가격 (원) (선택사항)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_stores',
    description: '위치 기반으로 가까운 다이소 매장을 찾습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          description: '위도',
        },
        longitude: {
          type: 'number',
          description: '경도',
        },
        radius: {
          type: 'number',
          description: '검색 반경 (km) (기본값: 5km)',
          default: 5,
        },
        limit: {
          type: 'number',
          description: '반환할 최대 매장 수 (기본값: 10)',
          default: 10,
        },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'check_inventory',
    description: '특정 매장의 제품 재고를 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        storeId: {
          type: 'string',
          description: '매장 ID',
        },
        productId: {
          type: 'string',
          description: '제품 ID',
        },
      },
      required: ['storeId', 'productId'],
    },
  },
  {
    name: 'get_price_info',
    description: '제품의 가격 정보를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: '제품 ID',
        },
      },
      required: ['productId'],
    },
  },
];

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight 요청 처리
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // 도구 목록 반환
    if (url.pathname === '/tools' && request.method === 'GET') {
      return new Response(JSON.stringify({ tools }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // 도구 실행
    if (url.pathname === '/execute' && request.method === 'POST') {
      try {
        const { name, arguments: args } = await request.json() as any;

        let result;
        switch (name) {
          case 'search_products':
            result = await searchProducts(args);
            break;
          case 'find_stores':
            result = await findStores(args);
            break;
          case 'check_inventory':
            result = await checkInventory(args);
            break;
          case 'get_price_info':
            result = await getPriceInfo(args);
            break;
          default:
            return new Response(
              JSON.stringify({ error: `Unknown tool: ${name}` }),
              {
                status: 400,
                headers: {
                  'Content-Type': 'application/json',
                  ...corsHeaders,
                },
              }
            );
        }

        return new Response(JSON.stringify(result), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return new Response(
          JSON.stringify({ error: errorMessage }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }
    }

    // 기본 정보 반환
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          name: 'daiso-mcp',
          version: '1.0.0',
          description: 'Daiso MCP Server for mobile access via Cloudflare Workers',
          endpoints: {
            tools: '/tools (GET) - 사용 가능한 도구 목록',
            execute: '/execute (POST) - 도구 실행',
          },
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders,
    });
  },
};
