import { describe, expect, it } from 'vitest';
import { renderApiEnvelope } from '../../../src/cliRenderer.js';
import { generateFullOpenApiSpec } from '../../../src/pages/openapiFullSpec.js';
import { generatePromptText } from '../../../src/pages/prompt.js';
describe('일본 다이소 표시와 발견', () => {
  it('온라인 상품 가격을 엔화로 표시한다', () => {
    const result = renderApiEnvelope(
      'jp-products',
      new URL('https://local/api/daiso-jp/products'),
      {
        success: true,
        data: { products: [{ id: '123', name: 'ボウル', price: 220, currency: 'JPY' }] },
      },
    );
    expect(result).toContain('220 JPY');
    expect(result).not.toContain('220원');
  });
  it('매장 재고 미지원과 온라인 상세를 표시한다', () => {
    const result = renderApiEnvelope(
      'jp-product',
      new URL('https://local/api/daiso-jp/products/123'),
      {
        success: true,
        data: {
          name: 'ボウル',
          price: 220,
          currency: 'JPY',
          onlineAvailable: null,
          note: '공식 상품 코드 검색 결과입니다.',
          storeInventorySupported: false,
        },
      },
    );
    expect(result).toContain('220 JPY');
    expect(result).toContain('매장 재고 미지원');
    expect(result).toContain('공식 상품 코드 검색 결과입니다.');
  });
  it('명세와 에이전트 안내에 세 가지 경로를 노출한다', () => {
    const spec = generateFullOpenApiSpec('https://local') as { paths: Record<string, unknown> };
    for (const p of [
      '/api/daiso-jp/products',
      '/api/daiso-jp/products/{id}',
      '/api/daiso-jp/stores',
    ])
      expect(spec.paths[p]).toBeDefined();
    const prompt = generatePromptText('https://local');
    expect(prompt).toContain('/api/daiso-jp/products?q=');
    expect(prompt).toContain('일본 매장 재고 조회는 아직 지원하지 않습니다.');
  });
});

it('일본 다이소 원본 오류를 한국 서비스로 분류하지 않는다', async () => {
  const { toStandardErrorDiagnostics } = await import('../../../src/core/errors.js');
  const d = toStandardErrorDiagnostics('DAISO_JP_UPSTREAM_FAILED', '원본 오류');
  expect(d.service).toBe('daiso_jp');
  expect(d.operation).toBe('upstream');
});
