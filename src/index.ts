/**
 * 다이소 MCP 서버
 *
 * Cloudflare Workers에서 실행되는 MCP 서버입니다.
 * 다이소 매장 검색, 제품 검색, 재고 확인 기능을 제공합니다.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import * as z from 'zod';

import { searchProducts } from './tools/searchProducts.js';
import { findStores } from './tools/findStores.js';
import { checkInventory } from './tools/checkInventory.js';
import { getPriceInfo } from './tools/getPriceInfo.js';

// MCP 서버 생성 함수
const createMcpServer = () => {
  const server = new McpServer({
    name: 'daiso-mcp',
    version: '1.0.0',
  });

  // 제품 검색 도구
  server.registerTool(
    'search_products',
    {
      title: '제품 검색',
      description: '다이소 제품을 검색합니다. 키워드로 제품을 검색할 수 있습니다.',
      inputSchema: {
        query: z.string().describe('검색할 제품명 또는 키워드'),
        page: z.number().optional().default(1).describe('페이지 번호 (기본값: 1)'),
        pageSize: z.number().optional().default(30).describe('페이지당 결과 수 (기본값: 30)'),
      },
    },
    async (args) => {
      const result = await searchProducts(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // 매장 검색 도구
  server.registerTool(
    'find_stores',
    {
      title: '매장 검색',
      description:
        '다이소 매장을 검색합니다. 키워드(매장명, 주소) 또는 지역(시도/구군/동)으로 검색할 수 있습니다.',
      inputSchema: {
        keyword: z.string().optional().describe('검색할 매장명 또는 주소 키워드 (예: 강남, 홍대)'),
        sido: z.string().optional().describe('시/도 (예: 서울, 경기, 부산)'),
        gugun: z.string().optional().describe('구/군 (예: 강남구, 마포구)'),
        dong: z.string().optional().describe('동 (예: 역삼동, 합정동)'),
        limit: z.number().optional().default(50).describe('반환할 최대 매장 수 (기본값: 50)'),
      },
    },
    async (args) => {
      const result = await findStores(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // 재고 확인 도구
  server.registerTool(
    'check_inventory',
    {
      title: '재고 확인',
      description:
        '특정 제품의 매장별 재고를 확인합니다. 매장명/주소 검색 또는 위치 기반으로 조회합니다.',
      inputSchema: {
        productId: z.string().describe('제품 ID (search_products로 조회한 상품의 id)'),
        storeQuery: z.string().optional().describe('매장 검색어 (매장명 또는 주소, 예: 안산 중앙역)'),
        latitude: z.number().optional().default(37.5665).describe('위도 (기본값: 서울 시청 37.5665)'),
        longitude: z.number().optional().default(126.978).describe('경도 (기본값: 서울 시청 126.978)'),
        page: z.number().optional().default(1).describe('페이지 번호 (기본값: 1)'),
        pageSize: z.number().optional().default(30).describe('페이지당 결과 수 (기본값: 30)'),
      },
    },
    async (args) => {
      const result = await checkInventory(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // 가격 정보 도구
  server.registerTool(
    'get_price_info',
    {
      title: '가격 정보',
      description: '제품의 가격 정보를 조회합니다. 제품 ID 또는 제품명으로 조회할 수 있습니다.',
      inputSchema: {
        productId: z.string().optional().describe('제품 ID'),
        productName: z.string().optional().describe('제품명 (productId가 없을 경우 사용)'),
      },
    },
    async (args) => {
      const result = await getPriceInfo(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
};

// Hono 앱 생성
const app = new Hono();

// CORS 설정
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'mcp-session-id', 'Last-Event-ID', 'mcp-protocol-version'],
    exposeHeaders: ['mcp-session-id', 'mcp-protocol-version'],
  })
);

// 기본 정보 엔드포인트 (GET 요청만)
app.get('/', (c) => {
  return c.json({
    name: 'daiso-mcp',
    version: '1.0.0',
    description: 'Daiso MCP Server for Cloudflare Workers',
    endpoints: {
      mcp: '/ 또는 /mcp (POST) - MCP 프로토콜 엔드포인트',
      health: '/health (GET) - 헬스 체크',
    },
  });
});

// 루트 경로에서 MCP 요청 처리 (POST, DELETE, OPTIONS)
app.on(['POST', 'DELETE', 'OPTIONS'], '/', async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// 헬스 체크 엔드포인트
app.get('/health', (c) => c.json({ status: 'ok' }));

// MCP 엔드포인트
app.all('/mcp', async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
