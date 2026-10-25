import { afterEach, expect, it, vi } from 'vitest';
import { HEALTH_CHECKS } from '../../src/api/healthCheckDefinitions.js';
import { handleEmart24CheckInventory } from '../../src/api/emart24Handlers.js';
import { MCP_SMOKE_SCENARIOS } from '../../scripts/ops/mcp-smoke.js';
import * as lookup from '../../src/services/emart24/inventoryLookup.js';
afterEach(() => vi.restoreAllMocks());
it('Health와 MCP의 이마트24 점포 상한이 실제 핸들러 인자로 동일하게 전달된다', async () => {
  const definition = HEALTH_CHECKS.find((check) => check.id === 'emart24.inventory')!;
  const smoke = MCP_SMOKE_SCENARIOS.find((check) => check.toolName === 'emart24_check_inventory')!;
  const params = new URL(definition.path, 'https://example.invalid').searchParams;
  expect(params.get('storeLimit')).toBe(String(smoke.args.storeLimit));
  expect(params.has('limit')).toBe(false);
  const upstream = vi
    .spyOn(lookup, 'lookupEmart24Inventory')
    .mockRejectedValue(new Error('요청 인자 확인용 중단'));
  const context = {
    env: {},
    req: { query: (key: string) => params.get(key) ?? undefined },
    header: vi.fn(),
    json: vi.fn(),
  };
  await handleEmart24CheckInventory(
    context as unknown as Parameters<typeof handleEmart24CheckInventory>[0],
  );
  expect(upstream).toHaveBeenCalledWith(
    expect.objectContaining({ storeLimit: 10, keyword: '커피', storeKeyword: '강남' }),
  );
});
