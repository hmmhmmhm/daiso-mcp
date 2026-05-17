/**
 * 상품명 기반 재고 통합 조회 도구 테스트
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFindInventoryByNameTool } from '../../../../src/services/daiso/tools/findInventoryByName.js';
import { createMockProductResponse } from '../../../api/testHelpers.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createFindInventoryByNameTool', () => {
  it('상품명과 위치만으로 상품 검색 후 재고를 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(createMockProductResponse([
        { PD_NO: '1049516', PDNM: '수납박스', PD_PRC: '1000' },
      ], 1))))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { pdNo: '1049516', stck: 4 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          {
            strCd: '11199',
            strNm: '강남역점',
            strAddr: '서울 강남구',
            strTno: '02',
            opngTime: '0900',
            clsngTime: '2200',
            strLttd: 37.5,
            strLitd: 127,
            km: '0.2km',
            parkYn: 'N',
            usimYn: 'N',
            pkupYn: 'Y',
            taxfYn: 'N',
            elvtYn: 'Y',
            entrRampYn: 'N',
            nocashYn: 'N',
          },
        ],
      })))
      .mockResolvedValueOnce(new Response('sample-token', { headers: { 'X-DM-UID': 'dm-uid-123' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: [{ pdNo: '1049516', strCd: '11199', stck: '2' }],
      })));

    const tool = createFindInventoryByNameTool();
    const result = await tool.handler({ query: '수납박스', storeQuery: '강남역', pageSize: 5 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.query).toBe('수납박스');
    expect(parsed.summary).toMatchObject({
      headline: expect.stringContaining('수납박스'),
      selectedProduct: '수납박스',
      storeQuery: '강남역',
      displayLocationHint: expect.stringContaining('daiso_get_display_location'),
    });
    expect(parsed.selectedProduct.id).toBe('1049516');
    expect(parsed.productCandidates).toHaveLength(1);
    expect(parsed.onlineStock).toBe(4);
    expect(parsed.storeInventory.stores[0]).toMatchObject({
      storeCode: '11199',
      storeName: '강남역점',
      quantity: 2,
    });
    expect(parsed.nextSteps.displayLocationTool).toBe('daiso_get_display_location');
    expect(parsed.nextSteps.storeCodeSource).toContain('storeInventory.stores[].storeCode');
  });

  it('상품 후보가 없으면 재고 조회 없이 빈 결과를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(createMockProductResponse([], 0))));

    const tool = createFindInventoryByNameTool();
    const result = await tool.handler({ query: '없는상품', storeQuery: '강남역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.productCandidates).toEqual([]);
    expect(parsed.summary.headline).toContain('상품 후보를 찾지 못했습니다');
    expect(parsed.selectedProduct).toBeNull();
    expect(parsed.storeInventory.stores).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('위치 키워드가 없으면 summary에서 미지정으로 표시한다', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(createMockProductResponse([], 0))));

    const tool = createFindInventoryByNameTool();
    const result = await tool.handler({ query: '없는상품' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary.storeQuery).toBe('미지정');
  });

  it('위치 키워드 없이 조회하면 기본 위치 주변 summary를 만든다', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(createMockProductResponse([
        { PD_NO: '1049516', PDNM: '수납박스', PD_PRC: '1000' },
      ], 1))))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { pdNo: '1049516', stck: 0 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })))
      .mockResolvedValueOnce(new Response('sample-token', { headers: { 'X-DM-UID': 'dm-uid-123' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] })));

    const tool = createFindInventoryByNameTool();
    const result = await tool.handler({ query: '수납박스', pageSize: 1 });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary.storeQuery).toBe('미지정');
    expect(parsed.summary.inventorySummary).toContain('기본 위치 주변');
  });

  it('상품명이 비어 있으면 에러를 던진다', async () => {
    const tool = createFindInventoryByNameTool();

    await expect(tool.handler({ query: '   ' })).rejects.toThrow('상품명(query)을 입력해주세요.');
  });

  it('도구 설명은 최소 정보 사용자를 위한 통합 흐름을 안내한다', () => {
    const tool = createFindInventoryByNameTool();

    expect(tool.name).toBe('daiso_find_inventory_by_name');
    expect(tool.metadata.description).toContain('상품명과 대강의 위치만');
    expect(tool.metadata.description).toContain('제품 검색부터 재고 조회까지');
    expect(tool.metadata.inputSchema.query.description).toContain('상품명');
    expect(tool.metadata.inputSchema.storeQuery.description).toContain('역명');
  });
});
