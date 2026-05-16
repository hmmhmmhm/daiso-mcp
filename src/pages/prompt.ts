/**
 * 프롬프트 페이지
 *
 * MCP 미지원 AI 에이전트를 위한 API 설명 페이지입니다.
 * 에이전트가 이 페이지를 읽고 GET API를 사용할 수 있습니다.
 */

import { buildPromptCoreText } from './promptCoreText.js';
import { buildPromptReferenceText } from './promptReferenceText.js';
import { buildPromptRetailCinemaText } from './promptRetailCinemaText.js';

/**
 * 프롬프트 텍스트 생성
 */
export function generatePromptText(baseUrl: string): string {
  return [
    buildPromptCoreText(baseUrl),
    buildPromptRetailCinemaText(baseUrl),
    buildPromptReferenceText(baseUrl),
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
