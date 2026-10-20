/** 일본 다이소 운영 smoke 계약 테스트. */
import { describe, expect, it } from 'vitest';
import { CLI_SMOKE_COMMANDS } from '../../scripts/ops/cli-smoke.js';
import { MCP_SMOKE_SCENARIOS, MCP_SMOKE_TOOLS } from '../../scripts/ops/mcp-smoke.js';
import { HEALTH_CHECKS } from '../../src/api/healthCheckDefinitions.js';

const product = { id: '4550746075917', name: 'ボウル', currency: 'JPY' };
const store = { id: '0001', name: '渋谷店', brand: 'DAISO' };

describe('일본 다이소 운영 감시', () => {
  it('상품과 매장을 quick 헬스 체크에 등록한다', () => {
    expect(HEALTH_CHECKS.filter((check) => check.service === 'daiso_jp')).toEqual([
      expect.objectContaining({ id: 'daiso_jp.products', mode: 'quick', collectionKey: 'products', path: expect.stringContaining('/api/daiso-jp/products?q=') }),
      expect.objectContaining({ id: 'daiso_jp.stores', mode: 'quick', collectionKey: 'stores', path: expect.stringContaining('/api/daiso-jp/stores?keyword=') }),
    ]);
  });

  it('CLI 상품·매장 호출과 MCP 도구 세 개를 등록한다', () => {
    expect(CLI_SMOKE_COMMANDS.filter((item) => item.service === 'daiso_jp').map((item) => item.args)).toEqual([
      ['jp-products', 'ボウル', '--json'], ['jp-product', '4550746075917', '--json'], ['jp-stores', '渋谷', '--json'],
    ]);
    expect(MCP_SMOKE_TOOLS.filter((item) => item.service === 'daiso_jp').map((item) => item.name)).toEqual([
      'daiso_jp_search_products', 'daiso_jp_get_product', 'daiso_jp_find_stores',
    ]);
  });

  it('상품 상세의 국가·엔화·코드·이름·온라인 판매 여부와 매장 재고 미지원을 검증한다', () => {
    const cli = CLI_SMOKE_COMMANDS.find((item) => item.args[0] === 'jp-product');
    const mcp = MCP_SMOKE_SCENARIOS.find((item) => item.toolName === 'daiso_jp_get_product');
    expect(cli?.args).toEqual(['jp-product', '4550746075917', '--json']);
    expect(mcp?.args).toEqual({ id: '4550746075917' });
    expect(cli).toBeDefined();
    expect(mcp).toBeDefined();
    const valid = { ...product, country: 'JP', onlineAvailable: true, storeInventorySupported: false };
    for (const onlineAvailable of [true, false, null]) {
      const payload = { ...valid, onlineAvailable };
      expect(cli!.validate(JSON.stringify({ success: true, data: payload }), '')).toBeNull();
      expect(mcp!.validate(payload)).toBeNull();
    }
    for (const patch of [
      { country: 'KR' }, { currency: 'KRW' }, { id: '0000000000000' }, { id: undefined },
      { name: '' }, { name: undefined }, { onlineAvailable: undefined }, { onlineAvailable: 'true' },
      { storeInventorySupported: true }, { storeInventorySupported: undefined },
    ]) {
      const payload = { ...valid, ...patch };
      expect(cli!.validate(JSON.stringify({ success: true, data: payload }), '')).not.toBeNull();
      expect(mcp!.validate(payload)).not.toBeNull();
    }
  });

  it.each(['products', 'stores'] as const)('%s의 실제 필드·국가를 검증하고 빈 결과·잘못된 필드를 실패시킨다', (collection) => {
    const cli = CLI_SMOKE_COMMANDS.find((item) => item.service === 'daiso_jp' && item.args[0] === `jp-${collection}`);
    const mcp = MCP_SMOKE_SCENARIOS.find((item) => item.service === 'daiso_jp' && item.toolName.endsWith(collection === 'products' ? 'search_products' : 'find_stores'));
    expect(cli).toBeDefined();
    expect(mcp).toBeDefined();
    const valid = { country: 'JP', [collection]: [collection === 'products' ? product : store] };
    const invalid = [
      { ...valid, country: 'KR' }, { ...valid, [collection]: [] }, { country: 'JP' },
      { ...valid, [collection]: [null] },
      ...Object.keys(collection === 'products' ? product : store).map((field) => ({
        ...valid, [collection]: [{ ...(collection === 'products' ? product : store), [field]: undefined }],
      })),
      { ...valid, [collection]: [{ ...(collection === 'products' ? product : store), [collection === 'products' ? 'currency' : 'name']: collection === 'products' ? 'KRW' : '' }] },
    ];
    expect(cli!.validate(JSON.stringify({ success: true, data: valid }), '')).toBeNull();
    expect(mcp!.validate(valid)).toBeNull();
    for (const payload of invalid) {
      expect(cli!.validate(JSON.stringify({ success: true, data: payload }), '')).not.toBeNull();
      expect(mcp!.validate(payload)).not.toBeNull();
    }
  });
});
