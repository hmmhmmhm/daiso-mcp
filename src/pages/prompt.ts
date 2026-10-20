/**
 * 프롬프트 페이지
 *
 * MCP 미지원 AI 에이전트를 위한 API 설명 페이지입니다.
 * 에이전트가 이 페이지를 읽고 GET API를 사용할 수 있습니다.
 */

import { buildAgentStartText } from './agentStart.js';
import { buildPromptCoreText } from './promptCoreText.js';
import { buildPromptReferenceText } from './promptReferenceText.js';
import { buildPromptRetailCinemaText } from './promptRetailCinemaText.js';

/**
 * 프롬프트 텍스트 생성
 */
export function generatePromptText(baseUrl: string): string {
  return [
    buildAgentStartText(baseUrl),
    buildPromptCoreText(baseUrl),
    buildPromptRetailCinemaText(baseUrl),
    buildPromptReferenceText(baseUrl),
    `
## 일본 다이소 (daiso_jp)
일본어 키워드로 일본 다이소를 검색합니다. 한국 다이소와 상품·매장 ID가 다르며 가격은 JPY입니다.
- 상품: ${baseUrl}/api/daiso-jp/products?q=%E3%83%9C%E3%82%A6%E3%83%AB&format=html
- 상세: ${baseUrl}/api/daiso-jp/products/4550746075917?format=html
- 매장: ${baseUrl}/api/daiso-jp/stores?keyword=%E6%B8%8B%E8%B0%B7&format=html
매장명·주소를 검색하므로 지역을 확인하세요. 다음 페이지는 page를 증가시키되 hasNext=true일 때만 요청하세요.
온라인 판매 가능 여부는 매장 재고가 아닙니다. 일본 매장 재고 조회는 아직 지원하지 않습니다.
MCP: daiso_jp_search_products(query,page), daiso_jp_get_product(id), daiso_jp_find_stores(keyword,page).
CLI: jp-products ボウル / jp-product 4550746075917 / jp-stores 渋谷.
`,
  ].join('');
}

/**
 * 프롬프트 페이지 응답 생성
 */
export function createPromptResponse(baseUrl: string): Response {
  const text = generatePromptText(baseUrl);

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
