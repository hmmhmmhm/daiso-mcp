/**
 * 다중 서비스 MCP 서버
 *
 * Cloudflare Workers에서 실행되는 플러그인 기반 MCP 서버입니다.
 * 다이소, 편의점, 백화점 등 다양한 서비스를 확장할 수 있습니다.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { ServiceRegistry } from './core/registry.js';
import { createDaisoService } from './services/daiso/index.js';
import { createPromptResponse } from './pages/prompt.js';
import {
  handleSearchProducts,
  handleGetProduct,
  handleFindStores,
  handleCheckInventory,
} from './api/handlers.js';

// 서버 메타데이터
const SERVER_NAME = 'multi-service-mcp';
const SERVER_VERSION = '1.0.0';

// 서비스 레지스트리 초기화
const registry = new ServiceRegistry();

// 서비스 등록 (새 서비스 추가 시 여기에 한 줄 추가)
registry.registerAll([createDaisoService]);

/**
 * MCP 서버 생성 함수
 */
const createMcpServer = () => {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // 레지스트리에 등록된 모든 서비스의 도구를 MCP 서버에 적용
  registry.applyToServer(server);

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
  const services = registry.getServicesInfo();
  const allTools = registry.getAllToolNames();

  return c.json({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    description: 'Multi-Service MCP Server for Cloudflare Workers',
    endpoints: {
      mcp: '/ 또는 /mcp (POST) - MCP 프로토콜 엔드포인트',
      health: '/health (GET) - 헬스 체크',
    },
    services,
    tools: allTools,
    totalServices: services.length,
    totalTools: allTools.length,
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

// 프롬프트 페이지 (MCP 미지원 에이전트용)
app.get('/prompt', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return createPromptResponse(baseUrl);
});

// GET API 엔드포인트 (MCP 미지원 에이전트용)
app.get('/api/daiso/products', handleSearchProducts);
app.get('/api/daiso/products/:id', handleGetProduct);
app.get('/api/daiso/stores', handleFindStores);
app.get('/api/daiso/inventory', handleCheckInventory);

// MCP 엔드포인트
app.all('/mcp', async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
