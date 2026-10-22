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
- 상품: ${baseUrl}/browse/daiso-jp/products/ボウル
- 상세: ${baseUrl}/browse/daiso-jp/product/4550746075917
- 매장: ${baseUrl}/browse/daiso-jp/stores/渋谷
매장명·주소를 검색하므로 지역을 확인하세요. 다음 페이지는 page를 증가시키되 hasNext=true일 때만 요청하세요.
온라인 판매 가능 여부는 매장 재고가 아닙니다. 일본 매장 재고 조회는 아직 지원하지 않습니다.
MCP: search_products {"service":"daiso_jp","query":"ボウル"}, get_product_details {"service":"daiso_jp","operation":"product","id":"검색한 실제 코드"}, find_stores {"service":"daiso_jp","keyword":"渋谷"}.
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
      'Cache-Control': 'no-store',
    },
  });
}
