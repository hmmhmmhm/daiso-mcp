const REQUEST_PROPERTIES = {
  type: {
    type: 'string',
    enum: ['bug', 'improvement', 'feature', 'docs', 'other'],
    default: 'other',
  },
  severity: {
    type: 'string',
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  title: { type: 'string' },
  description: { type: 'string' },
  service: { type: 'string' },
  toolName: { type: 'string' },
  reproduction: { type: 'string' },
  expected: { type: 'string' },
  actual: { type: 'string' },
  source: {
    type: 'string',
    enum: ['mcp', 'chatgpt', 'claude', 'cli', 'api', 'other'],
  },
} as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        severity: { type: 'string' },
        title: { type: 'string' },
        service: { type: 'string' },
        toolName: { type: 'string' },
        source: { type: 'string' },
        status: { type: 'string' },
        createdAt: { type: 'string' },
      },
    },
  },
} as const;

export const OPENAPI_PATHS_FEEDBACK = {
  '/api/feedback/requests': {
    post: {
      operationId: 'submitDeveloperRequest',
      summary: '개발자 요청 제출',
      description:
        'MCP 기능 오류, 개선 요청, 신규 기능 요청, 문서 문제를 개발자에게 전달하고 Supabase에 저장합니다.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'description'],
              properties: REQUEST_PROPERTIES,
            },
          },
        },
      },
      responses: {
        '200': {
          description: '개발자 요청 저장 결과',
          content: {
            'application/json': {
              schema: RESPONSE_SCHEMA,
            },
          },
        },
      },
    },
    get: {
      operationId: 'submitDeveloperRequestViaQuery',
      summary: '개발자 요청 제출(GET)',
      description: 'OpenAI Actions facade 등 GET만 가능한 환경에서 개발자 요청을 제출합니다.',
      parameters: Object.entries(REQUEST_PROPERTIES).map(([name, schema]) => ({
        name,
        in: 'query',
        required: name === 'title' || name === 'description',
        schema,
      })),
      responses: {
        '200': {
          description: '개발자 요청 저장 결과',
          content: {
            'application/json': {
              schema: RESPONSE_SCHEMA,
            },
          },
        },
      },
    },
  },
} as const;
