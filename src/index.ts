/**
 * 다중 서비스 MCP 서버
 *
 * Cloudflare Workers에서 실행되는 플러그인 기반 MCP 서버입니다.
 * 다이소, 편의점, 백화점 등 다양한 서비스를 확장할 수 있습니다.
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { ServiceRegistry } from './core/registry.js';
import { createDaisoService } from './services/daiso/index.js';
import { createOliveyoungService } from './services/oliveyoung/index.js';
import { createMegaboxService } from './services/megabox/index.js';
import { createCgvService } from './services/cgv/index.js';
import { createLotteCinemaService } from './services/lottecinema/index.js';
import { createLotteMartService } from './services/lottemart/index.js';
import { createCuService } from './services/cu/index.js';
import { createEmart24Service } from './services/emart24/index.js';
import { createGs25Service } from './services/gs25/index.js';
import { createSevenElevenService } from './services/seveneleven/index.js';
import { createPromptResponse } from './pages/prompt.js';
import {
  createFullOpenApiJsonResponse,
  createFullOpenApiYamlResponse,
  createOpenApiJsonResponse,
  createOpenApiYamlResponse,
} from './pages/openapi.js';
import { createPrivacyResponse } from './pages/privacy.js';
import type { AppBindings } from './api/response.js';
import { buildActionQueryTargetUrl } from './api/actionsProxy.js';
import { registerDaisoRoutes } from './api/routes/daisoRoutes.js';
import { registerOliveyoungRoutes } from './api/routes/oliveyoungRoutes.js';
import { registerMegaboxRoutes } from './api/routes/megaboxRoutes.js';
import { registerCgvRoutes } from './api/routes/cgvRoutes.js';
import { registerLotteCinemaRoutes } from './api/routes/lottecinemaRoutes.js';
import { registerLotteMartRoutes } from './api/routes/lottemartRoutes.js';
import { registerCuRoutes } from './api/routes/cuRoutes.js';
import { registerEmart24Routes } from './api/routes/emart24Routes.js';
import { registerGs25Routes } from './api/routes/gs25Routes.js';
import { registerSevenElevenRoutes } from './api/routes/sevenelevenRoutes.js';

// 서버 메타데이터
const SERVER_NAME = 'multi-service-mcp';
const SERVER_VERSION = '1.0.0';
const SESSION_HEADER = 'mcp-session-id';

// 세션별 MCP 전송 계층/서버를 유지해 GET/POST/DELETE를 일관 처리합니다.
const mcpSessions = new Map<
  string,
  {
    server: McpServer;
    transport: WebStandardStreamableHTTPServerTransport;
  }
>();

/**
 * 요청 컨텍스트 기반 서비스 레지스트리 생성
 */
const createRegistry = (bindings?: AppBindings) => {
  const registry = new ServiceRegistry();

  registry.registerAll([
    createDaisoService,
    createGs25Service,
    createSevenElevenService,
    createCuService,
    createEmart24Service,
      () =>
        createLotteMartService({
          googleMapsApiKey: bindings?.GOOGLE_MAPS_API_KEY,
        }),
    createMegaboxService,
    createLotteCinemaService,
    () =>
      createCgvService({
        zyteApiKey: bindings?.ZYTE_API_KEY,
        googleMapsApiKey: bindings?.GOOGLE_MAPS_API_KEY,
      }),
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

/**
 * initialize 요청 여부를 확인합니다.
 */
const isInitializeRequest = (body: unknown): boolean => {
  if (Array.isArray(body)) {
    return body.some(
      (item) => typeof item === 'object' && item !== null && (item as { method?: unknown }).method === 'initialize'
    );
  }

  return typeof body === 'object' && body !== null && (body as { method?: unknown }).method === 'initialize';
};

/**
 * 새 세션 transport/server를 생성합니다.
 */
const createSessionTransport = (bindings?: AppBindings) => {
  const server = createMcpServer(bindings);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId) => {
      mcpSessions.set(sessionId, { server, transport });
    },
    onsessionclosed: (sessionId) => {
      mcpSessions.delete(sessionId);
    },
  });

  return { server, transport };
};

/**
 * /mcp 요청을 세션 기반으로 처리합니다.
 */
const handleMcpRequest = async (c: Context<{ Bindings: AppBindings }>) => {
  const sessionId = c.req.header(SESSION_HEADER);

  if (sessionId) {
    const existing = mcpSessions.get(sessionId);
    if (!existing) {
      return c.json(
        {
          error: 'Session not found',
          message: '유효하지 않은 mcp-session-id 입니다. initialize 요청부터 다시 시작해주세요.',
        },
        404
      );
    }

    return existing.transport.handleRequest(c.req.raw);
  }

  if (c.req.method === 'POST') {
    const parsedBody = await c.req.raw
      .clone()
      .json()
      .catch(() => undefined);

    if (!isInitializeRequest(parsedBody)) {
      return c.json(
        {
          error: 'Bad Request',
          message: '세션이 없습니다. 먼저 initialize 요청으로 세션을 생성해주세요.',
        },
        400
      );
    }

    const { server, transport } = createSessionTransport(c.env);
    await server.connect(transport);
    return transport.handleRequest(c.req.raw, { parsedBody });
  }

  return c.json(
    {
      error: 'Bad Request',
      message: `세션이 없습니다. 먼저 POST /mcp initialize 요청 후 ${SESSION_HEADER} 헤더를 사용해주세요.`,
    },
    400
  );
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
      openapi: '/openapi.json (GET) - OpenAI Actions용 축약 OpenAPI',
      openapiFull: '/openapi-full.json (GET) - 전체 OpenAPI',
      actionsQuery: '/api/actions/query (GET) - 기존 GET API 통합 facade',
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

app.get('/openapi-full.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return createFullOpenApiJsonResponse(baseUrl);
});

app.get('/openapi-full.yaml', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return createFullOpenApiYamlResponse(baseUrl);
});

// 개인정보 처리방침 페이지
app.get('/privacy', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return createPrivacyResponse(baseUrl);
});

// GET API 엔드포인트 (MCP 미지원 에이전트용)
registerDaisoRoutes(app);
registerGs25Routes(app);
registerSevenElevenRoutes(app);
registerCuRoutes(app);
registerEmart24Routes(app);
registerLotteMartRoutes(app);
registerOliveyoungRoutes(app);
registerMegaboxRoutes(app);
registerLotteCinemaRoutes(app);
registerCgvRoutes(app);

app.get('/api/actions/query', async (c) => {
  try {
    const targetUrl = buildActionQueryTargetUrl(c.req.url);
    const headers = new Headers(c.req.raw.headers);
    headers.delete('host');

    return app.fetch(
      new Request(targetUrl.toString(), {
        method: 'GET',
        headers,
      }),
      c.env,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_ACTION_QUERY',
          message,
        },
      },
      400,
    );
  }
});

// MCP 엔드포인트
app.all('/mcp', handleMcpRequest);

export default app;
