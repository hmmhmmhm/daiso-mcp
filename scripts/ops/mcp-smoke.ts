import {
  validateDaisoInventoryByName,
  validateCatalogPopwords,
  validateCatalogSnapshot,
  validateRetailInventory,
  validateCinemaCollection,
} from './mcp-smoke-validation.js';
import { COMPACT_CATALOG, PUBLIC_TOOL_NAMES } from '../../src/core/compact/catalog.js';
/**
 * MCP 클라이언트 관점 smoke 테스트
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DEFAULT_MCP_URL } from '../../src/cli/constants.js';

type WriteFn = (message: string) => void;
type SmokeService =
  | 'daiso_jp'
  | 'daiso'
  | 'gs25'
  | 'seveneleven'
  | 'emart24'
  | 'opinet'
  | 'cu'
  | 'oliveyoung'
  | 'megabox'
  | 'lottecinema'
  | 'cgv'
  | 'dtryx';

interface ToolListResult {
  tools: Array<{ name: string }>;
}

interface ToolCallResult {
  isError?: boolean;
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
  service?: string;
}

interface McpSmokeScenario {
  service: SmokeService;
  label: string;
  toolName: string;
  args: Record<string, unknown>;
  productCode?: 'itemCode' | 'pluCd';
  validate: (payload: Record<string, unknown>) => string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolPayload(result: ToolCallResult): Record<string, unknown> {
  const text = result.content?.find(
    (item) => item.type === 'text' && typeof item.text === 'string',
  )?.text;
  if (result.isError) {
    throw new Error(text || 'MCP 도구 호출이 오류를 반환했습니다');
  }
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
  const text = result?.content?.find(
    (item) => item.type === 'text' && typeof item.text === 'string',
  )?.text;
  return (text || JSON.stringify(result ?? {})).replace(/\s+/g, ' ').slice(0, 500);
}

function formatScenarioFailure(
  scenario: McpSmokeScenario,
  message: string,
  result?: ToolCallResult,
  args: Record<string, unknown> = scenario.args,
): string {
  const group = COMPACT_CATALOG.find((g) => g.routes.some((r) => r.legacy === scenario.toolName))!;
  return [
    `MCP smoke 실패: ${scenario.label} - ${message}`,
    `tool=${group.name}`,
    `scenario=${scenario.toolName}`,
    `args=${JSON.stringify(args)}`,
    `responseExcerpt=${createResponseExcerpt(result)}`,
  ].join(' ');
}

function expectField(
  fieldName: string,
  expected: unknown,
): (payload: Record<string, unknown>) => string | null {
  return (payload) =>
    payload[fieldName] === expected ? null : `${fieldName} 값이 ${String(expected)}가 아닙니다`;
}

function validateJapanProduct(payload: Record<string, unknown>): string | null {
  const valid =
    payload.country === 'JP' &&
    payload.currency === 'JPY' &&
    payload.id === '4550746075917' &&
    typeof payload.name === 'string' &&
    payload.name.trim().length > 0 &&
    (typeof payload.onlineAvailable === 'boolean' || payload.onlineAvailable === null) &&
    payload.storeInventorySupported === false;
  return valid ? null : '일본 상품 상세의 필수 필드 또는 판매 가능 여부가 올바르지 않습니다';
}

function validateJapanCollection(
  payload: Record<string, unknown>,
  key: 'products' | 'stores',
): string | null {
  const items = payload[key];
  const valid =
    payload.country === 'JP' &&
    Array.isArray(items) &&
    items.length > 0 &&
    items.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        item.id.trim().length > 0 &&
        typeof item.name === 'string' &&
        item.name.trim().length > 0 &&
        (key === 'products'
          ? item.currency === 'JPY'
          : typeof item.brand === 'string' && item.brand.trim().length > 0),
    );
  return valid ? null : `일본 ${key}의 국가 또는 필수 필드가 올바르지 않습니다`;
}

export const MCP_SMOKE_SCENARIOS: McpSmokeScenario[] = [
  {
    service: 'daiso',
    label: '다이소 상품명 재고 통합 조회',
    toolName: 'daiso_find_inventory_by_name',
    args: { query: '수납박스', storeQuery: '강남역', pageSize: 1, productLimit: 1 },
    validate: validateDaisoInventoryByName,
  },
  {
    service: 'daiso_jp',
    label: '일본 다이소 상품 검색',
    toolName: 'daiso_jp_search_products',
    args: { query: 'ボウル', page: 1 },
    validate: (payload) => validateJapanCollection(payload, 'products'),
  },
  {
    service: 'daiso_jp',
    label: '일본 다이소 상품 상세',
    toolName: 'daiso_jp_get_product',
    args: { id: '4550746075917' },
    validate: validateJapanProduct,
  },
  {
    service: 'daiso_jp',
    label: '일본 다이소 매장 검색',
    toolName: 'daiso_jp_find_stores',
    args: { keyword: '渋谷', page: 1 },
    validate: (payload) => validateJapanCollection(payload, 'stores'),
  },
  {
    service: 'gs25',
    label: 'GS25 상품 검색',
    toolName: 'gs25_search_products',
    args: { keyword: '콜라', limit: 1 },
    validate: expectField('keyword', '콜라'),
  },
  {
    service: 'seveneleven',
    label: '세븐일레븐 상품 검색',
    toolName: 'seveneleven_search_products',
    args: { query: '커피', size: 1 },
    validate: expectField('query', '커피'),
  },
  {
    service: 'seveneleven',
    label: '세븐일레븐 인기 검색어',
    toolName: 'seveneleven_get_search_popwords',
    args: { label: 'home' },
    validate: validateCatalogPopwords,
  },
  {
    service: 'seveneleven',
    label: '세븐일레븐 카탈로그',
    toolName: 'seveneleven_get_catalog_snapshot',
    args: { limit: 2 },
    validate: validateCatalogSnapshot,
  },
  {
    service: 'emart24',
    label: '이마트24 상품 검색',
    toolName: 'emart24_search_products',
    args: { keyword: '커피', pageSize: 1 },
    validate: expectField('keyword', '커피'),
  },
  {
    service: 'opinet',
    label: '오피넷 전국 평균 유가 조회',
    toolName: 'opinet_get_average_prices',
    args: { timeoutMs: 10000 },
    validate: expectField('provider', 'opinet'),
  },
  ...(['gs25', 'seveneleven', 'emart24', 'cu', 'oliveyoung'] as const).map((service) => ({
    service,
    label: `${service} 실제 매장 재고`,
    toolName: `${service}_check_inventory`,
    args: {
      keyword:
        service === 'gs25'
          ? '콜라'
          : service === 'oliveyoung'
            ? '선크림'
            : service === 'seveneleven'
              ? '핫식스'
              : '커피',
      // 이마트24는 수량이 없는 점포를 응답에서 생략하므로 후보 10곳을 한 번에 묶어 조회합니다.
      storeLimit: service === 'emart24' ? 10 : 1,
      timeoutMs: 20000,
      ...(service === 'seveneleven' || service === 'emart24' ? { storeKeyword: '강남' } : {}),
      ...(service === 'gs25' || service === 'cu' || service === 'oliveyoung'
        ? { latitude: 37.4979, longitude: 127.0276 }
        : {}),
      ...(service === 'cu' ? { size: 1 } : {}),
      ...(service === 'oliveyoung' ? { size: 1, stockCheckLimit: 1 } : {}),
    },
    ...(service === 'gs25' ? { productCode: 'itemCode' as const } : {}),
    ...(service === 'emart24' ? { productCode: 'pluCd' as const } : {}),
    validate: (payload: Record<string, unknown>) => validateRetailInventory(service, payload),
  })),
  ...(['megabox', 'lottecinema', 'cgv'] as const).map((service) => ({
    service,
    label: `${service} 극장 검색`,
    toolName: service === 'cgv' ? 'cgv_find_theaters' : `${service}_find_nearby_theaters`,
    args: { latitude: 37.4979, longitude: 127.0276, limit: 1, timeoutMs: 15000 },
    validate: (payload: Record<string, unknown>) => validateCinemaCollection(payload, service),
  })),
  {
    service: 'dtryx',
    label: '디트릭스 상영작 조회',
    toolName: 'dtryx_list_now_showing',
    args: { cinemaCode: '000067', includePlayDates: false, timeoutMs: 15000 },
    validate: (payload) => validateCinemaCollection(payload, 'dtryx'),
  },
];

// 이전 시나리오 ID는 호출 라우팅에만 사용하고 공개 도구 목록은 늘리지 않습니다.
export const MCP_SMOKE_TOOLS = [
  { service: 'daiso', name: 'daiso_search_products' },
  { service: 'daiso', name: 'daiso_check_inventory' },
  ...MCP_SMOKE_SCENARIOS.map((scenario) => ({
    service: scenario.service,
    name: scenario.toolName,
  })),
];
export const MCP_SMOKE_TOOL_NAMES = MCP_SMOKE_TOOLS.map((tool) => tool.name);

function parseServiceArg(argv: string[]): string | undefined {
  const serviceIndex = argv.indexOf('--service');
  if (serviceIndex >= 0) {
    return argv[serviceIndex + 1];
  }
  return process.env.MCP_SMOKE_SERVICE;
}

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
  const service = deps.service || parseServiceArg(process.argv.slice(2));
  const smokeTools = service
    ? MCP_SMOKE_TOOLS.filter((tool) => tool.service === service)
    : MCP_SMOKE_TOOLS;
  const scenarios = service
    ? MCP_SMOKE_SCENARIOS.filter((scenario) => scenario.service === service)
    : MCP_SMOKE_SCENARIOS;

  if (smokeTools.length === 0 || scenarios.length === 0) {
    writeErr(`MCP smoke 실패: 지원하지 않는 service=${service}`);
    return 1;
  }

  let client: McpSmokeClient | undefined;
  try {
    writeOut(`MCP smoke 연결: ${endpoint}`);
    client = await createClient(endpoint);

    const tools = await client.listTools();
    const toolNames = new Set(tools.tools.map((tool) => tool.name));
    const missingTools = PUBLIC_TOOL_NAMES.filter((name) => !toolNames.has(name));
    if (tools.tools.length !== 10 || toolNames.size !== 10) {
      writeErr('MCP smoke 실패: 공개 도구는 정확히 10개여야 합니다.');
      return 1;
    }
    if (missingTools.length > 0) {
      writeErr(`MCP smoke 실패: 필수 도구 누락 - ${missingTools.join(', ')}`);
      return 1;
    }

    const productSearches = new Map<string, Record<string, unknown>>();
    for (const scenario of scenarios) {
      writeOut(`MCP smoke 호출: ${scenario.label}`);
      let result: ToolCallResult | undefined;
      let args: Record<string, unknown> = scenario.args;
      try {
        const group = COMPACT_CATALOG.find((group) =>
          group.routes.some((route) => route.legacy === scenario.toolName),
        )!;
        const route = group.routes.find((route) => route.legacy === scenario.toolName)!;
        args = {
          ...scenario.args,
          ...(route.service ? { service: route.service } : {}),
          ...(route.operation ? { operation: route.operation } : {}),
        };
        if (scenario.productCode) {
          const products = productSearches.get(scenario.service)?.products;
          const first = Array.isArray(products) ? products[0] : undefined;
          const code = isRecord(first) ? first[scenario.productCode] : undefined;
          if (typeof code !== 'string' || !code.trim())
            throw new Error('검색한 상품 코드가 없습니다');
          args[scenario.productCode] = code;
        }
        result = await client.callTool({
          name: group.name,
          arguments: args,
        });
        const payload = parseToolPayload(result);
        const validationError = scenario.validate(payload);
        if (group.name === 'search_products') productSearches.set(scenario.service, payload);
        if (validationError) {
          writeErr(formatScenarioFailure(scenario, validationError, result, args));
          return 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '알 수 없는 오류';
        writeErr(formatScenarioFailure(scenario, message, result, args));
        return 1;
      }
    }

    writeOut(`MCP smoke 통과: 공개 도구 10개 확인 및 ${scenarios.length}개 호출 완료`);
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
