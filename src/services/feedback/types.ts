export const DEVELOPER_REQUEST_TYPES = ['bug', 'improvement', 'feature', 'docs', 'other'] as const;
export const DEVELOPER_REQUEST_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const DEVELOPER_REQUEST_SOURCES = ['mcp', 'chatgpt', 'claude', 'cli', 'api', 'other'] as const;

export type DeveloperRequestType = (typeof DEVELOPER_REQUEST_TYPES)[number];
export type DeveloperRequestSeverity = (typeof DEVELOPER_REQUEST_SEVERITIES)[number];
export type DeveloperRequestSource = (typeof DEVELOPER_REQUEST_SOURCES)[number];

export interface DeveloperRequestInput {
  type?: string;
  severity?: string;
  title: string;
  description: string;
  service?: string;
  toolName?: string;
  reproduction?: string;
  expected?: string;
  actual?: string;
  source?: string;
  userContext?: unknown;
}

export interface DeveloperRequestConfig {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
}

export interface DeveloperRequestResult {
  id: string;
  type: DeveloperRequestType;
  severity: DeveloperRequestSeverity;
  title: string;
  service?: string;
  toolName?: string;
  source?: DeveloperRequestSource;
  status: string;
  createdAt?: string;
}
