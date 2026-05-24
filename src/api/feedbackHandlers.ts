import { errorResponse, successResponse, type ApiContext } from './response.js';
import { submitDeveloperRequest, type DeveloperRequestInput } from '../services/feedback/index.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

async function readJsonBody(c: ApiContext): Promise<Record<string, unknown>> {
  if (c.req.method !== 'POST') {
    return {};
  }
  return c.req.json<Record<string, unknown>>().catch(() => ({}));
}

function queryInput(c: ApiContext): Partial<DeveloperRequestInput> {
  return {
    type: c.req.query('type'),
    severity: c.req.query('severity'),
    title: c.req.query('title') || '',
    description: c.req.query('description') || '',
    service: c.req.query('service'),
    toolName: c.req.query('toolName'),
    reproduction: c.req.query('reproduction'),
    expected: c.req.query('expected'),
    actual: c.req.query('actual'),
    source: c.req.query('source') || 'api',
  };
}

function normalizeInput(raw: Record<string, unknown> | Partial<DeveloperRequestInput>): DeveloperRequestInput {
  return {
    type: typeof raw.type === 'string' ? raw.type : undefined,
    severity: typeof raw.severity === 'string' ? raw.severity : undefined,
    title: typeof raw.title === 'string' ? raw.title : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    service: typeof raw.service === 'string' ? raw.service : undefined,
    toolName: typeof raw.toolName === 'string' ? raw.toolName : undefined,
    reproduction: typeof raw.reproduction === 'string' ? raw.reproduction : undefined,
    expected: typeof raw.expected === 'string' ? raw.expected : undefined,
    actual: typeof raw.actual === 'string' ? raw.actual : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    userContext: raw.userContext,
  };
}

export async function handleSubmitDeveloperRequest(c: ApiContext) {
  try {
    const body = await readJsonBody(c);
    const input = normalizeInput(c.req.method === 'POST' ? body : queryInput(c));

    if (!input.title.trim()) {
      return errorResponse(c, 'MISSING_FEEDBACK_TITLE', 'title을 입력해주세요.', 400);
    }
    if (!input.description.trim()) {
      return errorResponse(c, 'MISSING_FEEDBACK_DESCRIPTION', 'description을 입력해주세요.', 400);
    }

    const result = await submitDeveloperRequest(input, {
      supabaseUrl: c.env?.SUPABASE_URL,
      supabaseServiceRoleKey: c.env?.SUPABASE_SERVICE_ROLE_KEY,
    });
    return successResponse(c, result);
  } catch (error) {
    return errorResponse(c, 'DEVELOPER_REQUEST_SUBMIT_FAILED', getErrorMessage(error), 500);
  }
}
