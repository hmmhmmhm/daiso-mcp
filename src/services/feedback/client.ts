import {
  DEVELOPER_REQUEST_SEVERITIES,
  DEVELOPER_REQUEST_SOURCES,
  DEVELOPER_REQUEST_TYPES,
  type DeveloperRequestConfig,
  type DeveloperRequestInput,
  type DeveloperRequestResult,
  type DeveloperRequestSeverity,
  type DeveloperRequestSource,
  type DeveloperRequestType,
} from './types.js';

interface SupabaseAgentRequestRow {
  id?: unknown;
  type?: unknown;
  severity?: unknown;
  title?: unknown;
  service?: unknown;
  tool_name?: unknown;
  source?: unknown;
  status?: unknown;
  created_at?: unknown;
}

interface AgentRequestInsertRow {
  type: DeveloperRequestType;
  severity: DeveloperRequestSeverity;
  title: string;
  description: string;
  service?: string;
  tool_name?: string;
  reproduction?: string;
  expected?: string;
  actual?: string;
  source?: DeveloperRequestSource;
  user_context?: unknown;
  status: 'open';
}

function isOneOf<T extends readonly string[]>(value: string | undefined, allowed: T): value is T[number] {
  return Boolean(value && allowed.includes(value));
}

function trimText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function requireText(value: unknown, fieldName: string, maxLength: number): string {
  const text = trimText(value, maxLength);
  if (!text) {
    throw new Error(`${fieldName}를 입력해주세요.`);
  }
  return text;
}

function normalizeType(value: string | undefined): DeveloperRequestType {
  return isOneOf(value, DEVELOPER_REQUEST_TYPES) ? value : 'other';
}

function normalizeSeverity(value: string | undefined): DeveloperRequestSeverity {
  return isOneOf(value, DEVELOPER_REQUEST_SEVERITIES) ? value : 'medium';
}

function normalizeSource(value: string | undefined): DeveloperRequestSource | undefined {
  return isOneOf(value, DEVELOPER_REQUEST_SOURCES) ? value : undefined;
}

function createInsertRow(input: DeveloperRequestInput): AgentRequestInsertRow {
  const row: AgentRequestInsertRow = {
    type: normalizeType(trimText(input.type, 40)),
    severity: normalizeSeverity(trimText(input.severity, 40)),
    title: requireText(input.title, 'title', 160),
    description: requireText(input.description, 'description', 4000),
    status: 'open',
  };

  const service = trimText(input.service, 80);
  const toolName = trimText(input.toolName, 120);
  const reproduction = trimText(input.reproduction, 4000);
  const expected = trimText(input.expected, 2000);
  const actual = trimText(input.actual, 2000);
  const source = normalizeSource(trimText(input.source, 40));

  if (service) row.service = service;
  if (toolName) row.tool_name = toolName;
  if (reproduction) row.reproduction = reproduction;
  if (expected) row.expected = expected;
  if (actual) row.actual = actual;
  if (source) row.source = source;
  if (input.userContext && typeof input.userContext === 'object') {
    row.user_context = input.userContext;
  }

  return row;
}

function requireConfig(config: DeveloperRequestConfig): { supabaseUrl: string; key: string } {
  const supabaseUrl = trimText(config.supabaseUrl, 400);
  const key = trimText(config.supabaseServiceRoleKey, 4000);
  if (!supabaseUrl || !key) {
    throw new Error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  }
  return { supabaseUrl: supabaseUrl.replace(/\/+$/, ''), key };
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resultFromRow(row: SupabaseAgentRequestRow, fallback: AgentRequestInsertRow): DeveloperRequestResult {
  return {
    id: stringOrUndefined(row.id) || '',
    type: normalizeType(stringOrUndefined(row.type) || fallback.type),
    severity: normalizeSeverity(stringOrUndefined(row.severity) || fallback.severity),
    title: stringOrUndefined(row.title) || fallback.title,
    service: stringOrUndefined(row.service) || fallback.service,
    toolName: stringOrUndefined(row.tool_name) || fallback.tool_name,
    source: normalizeSource(stringOrUndefined(row.source)) || fallback.source,
    status: stringOrUndefined(row.status) || fallback.status,
    createdAt: stringOrUndefined(row.created_at),
  };
}

export async function submitDeveloperRequest(
  input: DeveloperRequestInput,
  config: DeveloperRequestConfig,
): Promise<DeveloperRequestResult> {
  const { supabaseUrl, key } = requireConfig(config);
  const row = createInsertRow(input);
  const response = await fetch(`${supabaseUrl}/rest/v1/agent_requests`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase 저장 실패: ${response.status}${detail ? ` ${detail}` : ''}`);
  }

  const payload = (await response.json()) as unknown;
  const returnedRow = Array.isArray(payload) ? payload[0] : payload;
  if (!returnedRow || typeof returnedRow !== 'object') {
    throw new Error('Supabase 저장 결과가 비어 있습니다.');
  }

  return resultFromRow(returnedRow as SupabaseAgentRequestRow, row);
}
