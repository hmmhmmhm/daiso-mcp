import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { COMPACT_CATALOG } from '../../../src/core/compact/catalog.js';
import { createCompactTools } from '../../../src/core/compact/tools.js';
import { createDaisoService } from '../../../src/services/daiso/index.js';
import { createSevenElevenService } from '../../../src/services/seveneleven/index.js';
import { createGs25Service } from '../../../src/services/gs25/index.js';
import type { ToolRegistration } from '../../../src/core/types.js';

function actualTools() {
  const real = [
    ...createDaisoService().getTools(),
    ...createSevenElevenService().getTools(),
    ...createGs25Service().getTools(),
  ];
  const legacy: ToolRegistration[] = COMPACT_CATALOG.flatMap((g) =>
    g.routes.map(
      (r) =>
        real.find((t) => t.name === r.legacy) ?? {
          name: r.legacy,
          metadata: { title: r.legacy, description: '', inputSchema: {} },
          handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
        },
    ),
  );
  return { legacy, compact: createCompactTools(legacy) };
}
afterEach(() => vi.unstubAllGlobals());

describe('PlayMCP 실제 입력 계약', () => {
  it('get_catalog의 실행에 필수인 operation을 공개 스키마에서도 요구한다', () => {
    const { compact } = actualTools();
    const t = compact.find((t) => t.name === 'get_catalog')!;
    const schema = z.toJSONSchema(z.object(t.metadata.inputSchema), { io: 'input' });
    expect(schema.required).toContain('operation');
  });
  it('실제 PlayMCP가 보낸 popwords의 다른 작업 옵션 때문에 전체 조회가 실패하지 않으며 미적용을 알린다', async () => {
    const { compact } = actualTools();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: true, data: ['커피'] })),
    );
    const r = await compact
      .find((t) => t.name === 'get_catalog')!
      .handler({ operation: 'popwords', includeIssues: true, includeExhibition: true });
    expect(JSON.parse(r.content[0].text)).toMatchObject({ keywords: ['커피'], available: true });
    expect(r._meta).toMatchObject({ ignoredArguments: ['includeIssues', 'includeExhibition'] });
    expect(r.content.at(-1)?.text).toContain('적용하지 않았습니다');
  });
  it('다이소 재고의 storeLimit을 실제 매장 페이지 크기로 전달한다', async () => {
    const { legacy } = actualTools();
    const target = legacy.find((t) => t.name === 'daiso_find_inventory_by_name')!;
    const handler = vi.fn(async () => ({ content: [{ type: 'text' as const, text: '{}' }] }));
    target.handler = handler;
    const t = createCompactTools(legacy).find((t) => t.name === 'check_inventory')!;
    await t.handler({
      service: 'daiso',
      operation: 'by_name',
      query: '수납박스',
      storeQuery: '강남역',
      productLimit: 5,
      storeLimit: 2,
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 2, productLimit: 5 }));
    await expect(
      t.handler({ service: 'daiso', operation: 'by_name', query: 'x', storeLimit: 2, pageSize: 3 }),
    ).rejects.toThrow('storeLimit');
  });
  it.each([true, false])(
    '다이소 상품 검색에서 공개된 includeSoldOut=%s를 실제로 적용한다',
    async (includeSoldOut) => {
      const { compact } = actualTools();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({
            resultSet: {
              result: [
                {
                  totalSize: 2,
                  resultDocuments: [
                    { PD_NO: '1', PDNM: '수납박스', PD_PRC: '1000', SOLD_OUT_YN: 'N' },
                    { PD_NO: '2', PDNM: '품절 수납박스', PD_PRC: '1000', SOLD_OUT_YN: 'Y' },
                  ],
                },
              ],
            },
          }),
        ),
      );
      const r = await compact
        .find((t) => t.name === 'search_products')!
        .handler({ service: 'daiso', query: '수납박스', includeSoldOut });
      const j = JSON.parse(r.content[0].text);
      expect(j.products.map((p: { id: string }) => p.id)).toEqual(
        includeSoldOut ? ['1', '2'] : ['1'],
      );
      expect(j.count).toBe(includeSoldOut ? 2 : 1);
      expect(j.totalCount).toBe(2);
    },
  );
  it('실제 인수의 위치 설명과 허용 서비스가 합친 공개 스키마에서 사라지지 않는다', () => {
    const { compact } = actualTools();
    const fields = compact.find((t) => t.name === 'check_inventory')!.metadata.inputSchema;
    expect(fields.storeQuery.description).toContain('daiso');
    expect(fields.storeQuery.description).toContain('위치');
    expect(fields.storeLimit.description).toContain('gs25');
  });
});
