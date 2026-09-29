/** REST/MCP 기본 제한 시간이 무료 릴레이까지 전달되는지 검증합니다. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  handleOliveyoungSearchProducts,
  handleOliveyoungFindStores,
  handleOliveyoungCheckInventory,
} from '../../src/api/handlers.js';
import { createSearchProductsTool } from '../../src/services/oliveyoung/tools/searchProducts.js';
import { createFindNearbyStoresTool } from '../../src/services/oliveyoung/tools/findNearbyStores.js';
import { createCheckInventoryTool } from '../../src/services/oliveyoung/tools/checkInventory.js';
import * as client from '../../src/services/oliveyoung/client.js';
vi.mock('../../src/services/oliveyoung/client.js', () => ({
  fetchOliveyoungProducts: vi.fn(async () => ({ products: [], totalCount: 0 })),
  fetchOliveyoungStores: vi.fn(async () => ({ stores: [], totalCount: 0 })),
  enrichOliveyoungProductsWithNearbyStoreInventory: vi.fn(async () => ({
    products: [],
    checkedCount: 0,
  })),
}));
afterEach(() => vi.clearAllMocks());
function expectTimeout(expected: number) {
  const calls = [
    vi.mocked(client.fetchOliveyoungProducts),
    vi.mocked(client.fetchOliveyoungStores),
    vi.mocked(client.enrichOliveyoungProductsWithNearbyStoreInventory),
  ].flatMap((fn) => fn.mock.calls);
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) expect(call.at(-1)).toMatchObject({ timeout: expected });
}
for (const handler of [
  handleOliveyoungSearchProducts,
  handleOliveyoungFindStores,
  handleOliveyoungCheckInventory,
]) {
  it.each([
    [undefined, undefined, 15000],
    ['https://relay.example', undefined, 60000],
    ['https://relay.example', 'bad', 60000],
    ['https://relay.example', '1234', 1234],
  ] as const)(
    `${handler.name} REST 기본/명시 제한 시간 %s/%s`,
    async (relayUrl, timeoutMs, expected) => {
      const query: Record<string, string | undefined> = { keyword: 'test', timeoutMs };
      const context = {
        env: { OY_RELAY_URL: relayUrl },
        req: { query: (key: string) => query[key] },
        json: vi.fn(),
      } as unknown as Parameters<typeof handler>[0];
      await handler(context);
      expectTimeout(expected);
    },
  );
}
for (const create of [
  createSearchProductsTool,
  createFindNearbyStoresTool,
  createCheckInventoryTool,
]) {
  it.each([
    [undefined, undefined, 15000],
    ['https://relay.example', undefined, 60000],
    ['https://relay.example', 1234, 1234],
  ] as const)(
    `${create.name} MCP 기본/명시 제한 시간 %s/%s`,
    async (relayUrl, timeoutMs, expected) => {
      const tool = create(undefined, { relayUrl });
      const parsed = tool.metadata.inputSchema.timeoutMs.parse(timeoutMs);
      expect(parsed).toBe(expected);
      await tool.handler({ keyword: 'test', timeoutMs });
      expectTimeout(expected);
    },
  );
  it(`${create.name} 명시 인자가 설정 timeout보다 우선한다`, async () => {
    const tool = create(undefined, { relayUrl: 'https://relay.example', timeout: 5000 });
    expect(tool.metadata.inputSchema.timeoutMs.parse(undefined)).toBe(5000);
    await tool.handler({ keyword: 'test', timeoutMs: 1234 });
    expectTimeout(1234);
    vi.clearAllMocks();
    await tool.handler({ keyword: 'test' });
    expectTimeout(5000);
  });
}
