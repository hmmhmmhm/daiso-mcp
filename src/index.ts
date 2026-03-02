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
import { createOliveyoungService } from './services/oliveyoung/index.js';
import { withEdgeCache } from './utils/cache.js';
import { createPromptResponse } from './pages/prompt.js';
import { createOpenApiJsonResponse, createOpenApiYamlResponse } from './pages/openapi.js';
import { createPrivacyResponse } from './pages/privacy.js';
import {
  handleSearchProducts,
  handleGetProduct,
  handleFindStores,
  handleCheckInventory,
  handleOliveyoungFindStores,
  handleOliveyoungCheckInventory,
} from './api/handlers.js';

// 서버 메타데이터
const SERVER_NAME = 'multi-service-mcp';
const SERVER_VERSION = '1.0.0';

interface AppBindings {
  ZYTE_API_KEY?: string;
}

/**
 * 요청 컨텍스트 기반 서비스 레지스트리 생성
 */
const createRegistry = (bindings?: AppBindings) => {
  const registry = new ServiceRegistry();

  registry.registerAll([
    createDaisoService,
    () =>
      createOliveyoungService({
        zyteApiKey: bindings?.ZYTE_API_KEY,
      }),
  ]);

  return registry;
};

/**
 * MCP 서버 생성 함수
 */
const createMcpServer = (bindings?: AppBindings) => {
  const registry = createRegistry(bindings);
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registry.applyToServer(server);

  return server;
};

// Hono 앱 생성
const app = new Hono<{ Bindings: AppBindings }>();

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
  const registry = createRegistry(c.env);
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
  const server = createMcpServer(c.env);
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

// OpenAPI 스펙 엔드포인트 (ChatGPT GPTs 등록용)
app.get('/openapi.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return createOpenApiJsonResponse(baseUrl);
});

app.get('/openapi.yaml', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return createOpenApiYamlResponse(baseUrl);
});

// 개인정보 처리방침 페이지
app.get('/privacy', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return createPrivacyResponse(baseUrl);
});

// GET API 엔드포인트 (MCP 미지원 에이전트용)
app.get('/api/daiso/products', async (c) =>
  withEdgeCache(
    c.req.url,
    {
      ttlSeconds: 60 * 30,
      staleWhileRevalidateSeconds: 60 * 3,
      keyPrefix: 'daiso-products-v1',
    },
    () => handleSearchProducts(c)
  )
);
app.get('/api/daiso/products/:id', async (c) =>
  withEdgeCache(
    c.req.url,
    {
      ttlSeconds: 60 * 60,
      staleWhileRevalidateSeconds: 60 * 5,
      keyPrefix: 'daiso-product-detail-v1',
    },
    () => handleGetProduct(c)
  )
);
app.get('/api/daiso/stores', async (c) =>
  withEdgeCache(
    c.req.url,
    {
      ttlSeconds: 60 * 60 * 24,
      staleWhileRevalidateSeconds: 60 * 5,
      keyPrefix: 'daiso-stores-v1',
    },
    () => handleFindStores(c)
  )
);
app.get('/api/daiso/inventory', async (c) =>
  withEdgeCache(
    c.req.url,
    {
      ttlSeconds: 60 * 10,
      staleWhileRevalidateSeconds: 60,
      keyPrefix: 'daiso-inventory-v1',
    },
    () => handleCheckInventory(c)
  )
);
app.get('/api/oliveyoung/stores', async (c) =>
  withEdgeCache(
    c.req.url,
    {
      ttlSeconds: 60 * 60 * 24,
      staleWhileRevalidateSeconds: 60 * 5,
      keyPrefix: 'oliveyoung-stores-v1',
    },
    () => handleOliveyoungFindStores(c)
  )
);
app.get('/api/oliveyoung/inventory', async (c) =>
  withEdgeCache(
    c.req.url,
    {
      ttlSeconds: 60 * 10,
      staleWhileRevalidateSeconds: 60,
      keyPrefix: 'oliveyoung-inventory-v1',
    },
    () => handleOliveyoungCheckInventory(c)
  )
);

// MCP 엔드포인트
app.all('/mcp', async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServer(c.env);
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
