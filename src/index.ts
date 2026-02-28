/**
 * 다이소 MCP 서버
 *
 * Cloudflare Workers에서 실행되는 MCP 서버입니다.
 * 다이소 매장 검색, 제품 검색, 재고 확인 기능을 제공합니다.
 */

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
    description: '다이소 제품을 검색합니다. 키워드로 제품을 검색할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색할 제품명 또는 키워드',
        },
        page: {
          type: 'number',
          description: '페이지 번호 (기본값: 1)',
          default: 1,
        },
        pageSize: {
          type: 'number',
          description: '페이지당 결과 수 (기본값: 30)',
          default: 30,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_stores',
    description:
      '다이소 매장을 검색합니다. 키워드(매장명, 주소) 또는 지역(시도/구군/동)으로 검색할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '검색할 매장명 또는 주소 키워드 (예: 강남, 홍대)',
        },
        sido: {
          type: 'string',
          description: '시/도 (예: 서울, 경기, 부산)',
        },
        gugun: {
          type: 'string',
          description: '구/군 (예: 강남구, 마포구)',
        },
        dong: {
          type: 'string',
          description: '동 (예: 역삼동, 합정동)',
        },
        limit: {
          type: 'number',
          description: '반환할 최대 매장 수 (기본값: 50)',
          default: 50,
        },
      },
    },
  },
  {
    name: 'check_inventory',
    description:
      '특정 제품의 매장별 재고를 확인합니다. 위치 기반으로 가까운 매장부터 재고를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: '제품 ID (search_products로 조회한 상품의 id)',
        },
        latitude: {
          type: 'number',
          description: '위도 (기본값: 서울 시청 37.5665)',
          default: 37.5665,
        },
        longitude: {
          type: 'number',
          description: '경도 (기본값: 서울 시청 126.978)',
          default: 126.978,
        },
        page: {
          type: 'number',
          description: '페이지 번호 (기본값: 1)',
          default: 1,
        },
        pageSize: {
          type: 'number',
          description: '페이지당 결과 수 (기본값: 30)',
          default: 30,
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'get_price_info',
    description: '제품의 가격 정보를 조회합니다. 제품 ID 또는 제품명으로 조회할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: '제품 ID',
        },
        productName: {
          type: 'string',
          description: '제품명 (productId가 없을 경우 사용)',
        },
      },
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
        const { name, arguments: args } = (await request.json()) as any;

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
            return new Response(JSON.stringify({ error: `Unknown tool: ${name}` }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            });
        }

        return new Response(JSON.stringify(result), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
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
