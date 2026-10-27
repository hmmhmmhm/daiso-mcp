/** 설치 없는 에이전트 시작 안내 테스트 */
import { describe, it, expect } from 'vitest';
import { buildAgentStartText, createAgentStartResponse } from '../../src/pages/agentStart.js';
import { generatePromptText } from '../../src/pages/prompt.js';

describe('에이전트 시작 안내', () => {
  it('연결된 MCP 도구의 현재 입력과 WebFetch 첫 조회를 안내한다', () => {
    const text=buildAgentStartText('https://example.com');
    const args=text.match(/search_products (\{[^}]+\})/)?.[1];
    expect(JSON.parse(args!)).toEqual({service:'daiso',query:'수납박스',pageSize:3});
    expect(text).toContain('WebFetch');
    expect(text).toContain('structuredContent');
    expect(text).toContain('isError=true');
    expect(text).not.toContain('curl');
  });

  it('원격 MCP 연결과 WebFetch REST GET을 구분하고 전체 문서 읽기를 요구하지 않는다', () => {
    const text = buildAgentStartText('https://example.com');
    expect(text).toContain('https://mcp.aka.page');
    expect(text).toContain('Streamable HTTP');
    expect(text).toContain('인증: 없음');
    expect(text).toContain('initialize');
    expect(text).toContain('REST GET');
    expect(text).toContain('MCP 프로토콜 호출이 아닙니다');
    expect(text).toContain('/browse/read');
    expect(text).toContain('https://example.com/prompt');
    expect(text).toContain('전체 도구 목록이나 OpenAPI를 먼저 읽을 필요는 없습니다');
    expect(text.split('\n').length).toBeLessThan(45);
  });

  it('동일한 시작 안내 뒤에 기존 상세 프롬프트를 보존한다', () => {
    const baseUrl = 'https://example.com';
    const text = generatePromptText(baseUrl);
    expect(text.startsWith(buildAgentStartText(baseUrl))).toBe(true);
    expect(text.indexOf('# 다이소 MCP API')).toBeGreaterThan(text.indexOf('REST GET'));
    expect(text).toContain('/browse/daiso/inventory/{제품ID}');
    expect(text).toContain('MCP 지원 서비스');
  });

  it('새 캐시 저장을 막는 평문 응답을 반환한다', async () => {
    const response = createAgentStartResponse('https://example.com');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe(buildAgentStartText('https://example.com'));
  });
});
