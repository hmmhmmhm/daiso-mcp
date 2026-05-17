/**
 * MCP 클라이언트 관점 smoke 테스트
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DEFAULT_MCP_URL } from '../src/cli/constants.js';

type WriteFn = (message: string) => void;

interface ToolListResult {
  tools: Array<{ name: string }>;
}

interface ToolCallResult {
  content?: Array<{ type: string; text?: string }>;
}

interface McpSmokeClient {
  listTools(): Promise<ToolListResult>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<ToolCallResult>;
  close(): Promise<void>;
}

interface McpSmokeDeps {
  endpoint?: string;
  createClient?: (endpoint: string) => Promise<McpSmokeClient>;
  writeOut?: WriteFn;
  writeErr?: WriteFn;
}

export const MCP_SMOKE_TOOL_NAMES = [
  'daiso_search_products',
  'daiso_check_inventory',
  'daiso_find_inventory_by_name',
  'gs25_search_products',
  'seveneleven_search_products',
  'emart24_search_products',
];

interface McpSmokeScenario {
  label: string;
  toolName: string;
  args: Record<string, unknown>;
  validate: (payload: Record<string, unknown>) => string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolPayload(result: ToolCallResult): Record<string, unknown> {
  const text = result.content?.find((item) => item.type === 'text' && typeof item.text === 'string')?.text;
  if (!text) {
    throw new Error('도구 호출 결과에 text content가 없습니다');
  }

  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) {
    throw new Error('도구 호출 결과가 JSON object가 아닙니다');
  }

  return parsed;
}

function createResponseExcerpt(result: ToolCallResult | undefined): string {
  const text = result?.content?.find((item) => item.type === 'text' && typeof item.text === 'string')?.text;
  return (text || JSON.stringify(result ?? {})).replace(/\s+/g, ' ').slice(0, 500);
}

function formatScenarioFailure(
  scenario: McpSmokeScenario,
  message: string,
  result?: ToolCallResult,
): string {
  return [
    `MCP smoke 실패: ${scenario.label} - ${message}`,
    `tool=${scenario.toolName}`,
    `args=${JSON.stringify(scenario.args)}`,
    `responseExcerpt=${createResponseExcerpt(result)}`,
  ].join(' ');
}

function expectField(fieldName: string, expected: unknown): (payload: Record<string, unknown>) => string | null {
  return (payload) => (payload[fieldName] === expected ? null : `${fieldName} 값이 ${String(expected)}가 아닙니다`);
}

function validateDaisoInventoryByName(payload: Record<string, unknown>): string | null {
  if (!isRecord(payload.summary) || typeof payload.summary.headline !== 'string') {
    return '통합 조회 결과 summary.headline이 없습니다';
  }

  return null;
}

export const MCP_SMOKE_SCENARIOS: McpSmokeScenario[] = [
  {
    label: '다이소 상품명 재고 통합 조회',
    toolName: 'daiso_find_inventory_by_name',
    args: { query: '수납박스', storeQuery: '강남역', pageSize: 1, productLimit: 1 },
    validate: validateDaisoInventoryByName,
  },
  {
    label: 'GS25 상품 검색',
    toolName: 'gs25_search_products',
    args: { keyword: '콜라', limit: 1 },
    validate: expectField('keyword', '콜라'),
  },
  {
    label: '세븐일레븐 상품 검색',
    toolName: 'seveneleven_search_products',
    args: { query: '커피', size: 1 },
    validate: expectField('query', '커피'),
  },
  {
    label: '이마트24 상품 검색',
    toolName: 'emart24_search_products',
    args: { keyword: '커피', pageSize: 1 },
    validate: expectField('keyword', '커피'),
  },
];

export async function createSdkMcpSmokeClient(endpoint: string): Promise<McpSmokeClient> {
  const client = new Client({ name: 'daiso-mcp-smoke', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  await client.connect(transport);

  return {
    listTools: () => client.listTools(),
    callTool: (params) => client.callTool(params) as Promise<ToolCallResult>,
    close: () => client.close(),
  };
}

export async function runMcpSmoke(deps: McpSmokeDeps = {}): Promise<number> {
  const endpoint = deps.endpoint || process.env.MCP_SMOKE_URL || DEFAULT_MCP_URL;
  const createClient = deps.createClient || createSdkMcpSmokeClient;
  const writeOut = deps.writeOut || ((message: string) => process.stdout.write(`${message}\n`));
  const writeErr = deps.writeErr || ((message: string) => process.stderr.write(`${message}\n`));

  let client: McpSmokeClient | undefined;
  try {
    writeOut(`MCP smoke 연결: ${endpoint}`);
    client = await createClient(endpoint);

    const tools = await client.listTools();
    const toolNames = new Set(tools.tools.map((tool) => tool.name));
    const missingTools = MCP_SMOKE_TOOL_NAMES.filter((name) => !toolNames.has(name));
    if (missingTools.length > 0) {
      writeErr(`MCP smoke 실패: 필수 도구 누락 - ${missingTools.join(', ')}`);
      return 1;
    }

    for (const scenario of MCP_SMOKE_SCENARIOS) {
      writeOut(`MCP smoke 호출: ${scenario.label}`);
      let result: ToolCallResult | undefined;
      try {
        result = await client.callTool({
          name: scenario.toolName,
          arguments: scenario.args,
        });
        const payload = parseToolPayload(result);
        const validationError = scenario.validate(payload);
        if (validationError) {
          writeErr(formatScenarioFailure(scenario, validationError, result));
          return 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        writeErr(formatScenarioFailure(scenario, message, result));
        return 1;
      }
    }

    writeOut(
      `MCP smoke 통과: ${MCP_SMOKE_TOOL_NAMES.length}개 도구 확인 및 ${MCP_SMOKE_SCENARIOS.length}개 호출 완료`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    writeErr(`MCP smoke 실패: ${message}`);
    return 1;
  } finally {
    await client?.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMcpSmoke().then((exitCode) => {
    process.exit(exitCode);
  });
}
