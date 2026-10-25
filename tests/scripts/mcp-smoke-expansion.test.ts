import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MCP_SMOKE_SCENARIOS, runMcpSmoke } from '../../scripts/ops/mcp-smoke.js';
import { CLI_SMOKE_COMMANDS } from '../../scripts/ops/cli-smoke.js';
import { COMPACT_CATALOG, PUBLIC_TOOL_NAMES } from '../../src/core/compact/catalog.js';

const scenario = (name: string) => MCP_SMOKE_SCENARIOS.find((s) => s.toolName === name)!;
import { inventoryPayloads } from './mcp-smoke-fixtures.js';
const stores = [{ storeCode: 's1', storeName: '강남점' }];

const invoke = async (service: string, payload: unknown) => {
  const callTool = vi
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(payload) }] });
  const errors: string[] = [];
  const code = await runMcpSmoke({
    service,
    createClient: async () => ({
      listTools: async () => ({ tools: PUBLIC_TOOL_NAMES.map((name) => ({ name })) }),
      callTool,
      close: async () => undefined,
    }),
    writeOut: () => undefined,
    writeErr: (message) => errors.push(message),
  });
  return { code, callTool, errors };
};

describe('전체 서비스 공개 MCP smoke 확장', () => {
  it('CLI가 지원하는 모든 서비스가 실제 MCP 시나리오와 workflow에 포함된다', () => {
    const services = [...new Set(CLI_SMOKE_COMMANDS.map((command) => command.service))].sort();
    expect([...new Set(MCP_SMOKE_SCENARIOS.map((s) => s.service))].sort()).toEqual(services);
    const workflow = readFileSync('.github/workflows/external-smoke.yml', 'utf8');
    for (const variable of ['CLI_SMOKE_SERVICES', 'MCP_SMOKE_SERVICES']) {
      expect(
        workflow
          .match(new RegExp(`${variable}: (.+)`))![1]
          .split(' ')
          .sort(),
      ).toEqual(services);
    }
  });

  it.each(Object.keys(inventoryPayloads))('%s는 실제 재고 증거와 정상 품절을 검증한다', (name) => {
    const check = scenario(name)?.validate;
    expect(check).toBeTypeOf('function');
    expect(check?.(inventoryPayloads[name])).toBeNull();
    for (const payload of [
      {},
      { keyword: '커피' },
      { ...inventoryPayloads[name], inventory: {} },
    ]) {
      expect(check?.(payload)).toBeTypeOf('string');
    }
  });

  it.each([
    ['gs25_check_inventory', 'realStockQuantity'],
    ['seveneleven_check_inventory', 'stockQuantity'],
    ['emart24_check_inventory', 'bizQty'],
  ])('%s는 미확인, 누락, 음수, 문자열 수량을 거절한다', (name, field) => {
    for (const quantity of [null, undefined, -1, '0', NaN]) {
      const payload = structuredClone(inventoryPayloads[name]);
      const inventory = payload.inventory as { stores: Record<string, unknown>[] };
      inventory.stores[0][field] = quantity;
      expect(scenario(name)?.validate(payload)).toBeTypeOf('string');
    }
  });

  it('CU 상품 검색과 매장 목록만으로 재고 성공을 판정하지 않는다', () => {
    for (const stock of [null, undefined, -1, '0']) {
      const payload = structuredClone(inventoryPayloads.cu_check_inventory);
      const nearby = payload.nearbyStores as { stores: Record<string, unknown>[] };
      nearby.stores[0].stock = stock;
      expect(scenario('cu_check_inventory')?.validate(payload)).toBeTypeOf('string');
    }
  });

  it('올리브영 전역 재고와 미확인 매장 재고를 거절한다', () => {
    const check = scenario('oliveyoung_check_inventory')?.validate;
    const payload = structuredClone(inventoryPayloads.oliveyoung_check_inventory);
    const inventory = payload.inventory as {
      stockCheckedCount: number;
      products: Record<string, unknown>[];
    };
    inventory.stockCheckedCount = 0;
    expect(check?.(payload)).toBeTypeOf('string');
    inventory.stockCheckedCount = 1;
    inventory.products[0].stockSource = 'global_search';
    expect(check?.(payload)).toBeTypeOf('string');
    inventory.products[0].stockSource = 'nearby_store';
    inventory.products[0].storeInventory = {
      stores: [{ ...stores[0], remainQuantity: null, stockStatus: 'unknown' }],
    };
    expect(check?.(payload)).toBeTypeOf('string');
  });

  it('올리브영은 매장 일반 수량 또는 픽업 수량의 실제 증거를 인정한다', () => {
    const check = scenario('oliveyoung_check_inventory').validate;
    const payload = structuredClone(inventoryPayloads.oliveyoung_check_inventory);
    const inventory = payload.inventory as {
      products: { storeInventory: { stores: unknown[] } }[];
    };
    inventory.products[0].storeInventory.stores = [
      { ...stores[0], remainQuantity: null, o2oRemainQuantity: 0, stockStatus: 'out_of_stock' },
      { ...stores[0], remainQuantity: null, o2oRemainQuantity: null, stockStatus: 'unknown' },
    ];
    expect(check(payload)).toBeNull();
    inventory.products[0].storeInventory.stores = [
      { ...stores[0], remainQuantity: 0, stockStatus: 'unknown' },
    ];
    expect(check(payload)).toBeTypeOf('string');
    inventory.products[0].storeInventory.stores = [
      { ...stores[0], remainQuantity: null, stockStatus: 'out_of_stock' },
    ];
    expect(check(payload)).toBeTypeOf('string');
  });

  it('재고 집계가 실제 매장 및 상품과 다르면 실패한다', () => {
    for (const name of Object.keys(inventoryPayloads)) {
      const payload = structuredClone(inventoryPayloads[name]);
      const inventory = payload.inventory as Record<string, unknown>;
      if (name === 'cu_check_inventory') {
        (payload.nearbyStores as Record<string, unknown>).count = 2;
      } else if (name === 'oliveyoung_check_inventory') {
        inventory.stockCheckedCount = 2;
      } else {
        inventory.count = 2;
      }
      expect(scenario(name).validate(payload)).toBeTypeOf('string');
    }
    const cu = structuredClone(inventoryPayloads.cu_check_inventory);
    (cu.nearbyStores as Record<string, unknown>).stockItemCode = 'different';
    expect(scenario('cu_check_inventory').validate(cu)).toBeTypeOf('string');
  });

  it.each(['megabox', 'lottecinema', 'cgv'])('%s 극장 검색은 빈 결과를 거절한다', (service) => {
    const entry = MCP_SMOKE_SCENARIOS.find((s) => s.service === service)!;
    expect(entry).toBeDefined();
    const idKey = service === 'cgv' ? 'theaterCode' : 'theaterId';
    expect(entry?.validate({ theaters: [{ [idKey]: '1', theaterName: '강남' }] })).toBeNull();
    for (const theaters of [undefined, [], [{}], [{ [idKey]: '1' }]]) {
      expect(entry?.validate({ theaters })).toBeTypeOf('string');
    }
    expect(entry?.args.limit).toBe(1);
  });

  it('디트릭스는 한 극장의 실제 상영작을 조회한다', () => {
    const entry = scenario('dtryx_list_now_showing');
    expect(entry?.args).toMatchObject({ cinemaCode: '000067', includePlayDates: false });
    expect(entry?.validate({ movies: [{ movieCode: '1', movieName: '영화' }] })).toBeNull();
    for (const movies of [undefined, [], [{}], [{ movieCode: '1' }]]) {
      expect(entry?.validate({ movies })).toBeTypeOf('string');
    }
  });

  it.each(['cu', 'oliveyoung', 'megabox', 'lottecinema', 'cgv', 'dtryx'])(
    '%s는 공개 compact 도구를 실제 호출한다',
    async (service) => {
      const entry = MCP_SMOKE_SCENARIOS.find((s) => s.service === service)!;
      const group = COMPACT_CATALOG.find((g) => g.routes.some((r) => r.legacy === entry?.toolName));
      const payload =
        inventoryPayloads[entry?.toolName] ??
        (service === 'dtryx'
          ? { movies: [{ movieCode: '1', movieName: '영화' }] }
          : { theaters: [{ theaterId: '1', theaterCode: '1', theaterName: '강남' }] });
      const { code, callTool } = await invoke(service, payload);
      expect(code).toBe(0);
      expect(callTool).toHaveBeenCalledOnce();
      expect(callTool.mock.calls[0][0].name).toBe(group?.name);
      expect(PUBLIC_TOOL_NAMES).toContain(callTool.mock.calls[0][0].name);
    },
  );

  it.each(['gs25', 'emart24'])(
    '%s 검색 상품 코드가 없으면 후속 재고 호출을 하지 않는다',
    async (service) => {
      const { code, callTool, errors } = await invoke(service, {
        keyword: service === 'gs25' ? '콜라' : '커피',
        products: [],
      });
      expect(code).toBe(1);
      expect(callTool).toHaveBeenCalledOnce();
      expect(errors.join(' ')).toContain('검색한 상품 코드가 없습니다');
    },
  );

  it('실패 진단은 실제 compact 도구와 시나리오 ID를 구분한다', async () => {
    const { errors } = await invoke('daiso', {});
    expect(errors.join('\n')).toContain('tool=check_inventory');
    expect(errors.join('\n')).toContain('scenario=daiso_find_inventory_by_name');
    expect(errors.join('\n')).toContain('"operation":"by_name"');
  });
});
