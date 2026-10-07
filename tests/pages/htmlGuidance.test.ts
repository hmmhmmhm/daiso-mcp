import { describe, expect, it } from 'vitest';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';
import { buildAgentStartText } from '../../src/pages/agentStart.js';
import { generatePromptText } from '../../src/pages/prompt.js';
import app from '../../src/index.js';

const rule = '모든 /api/* GET 조회 URL에 format=html을 반드시 포함하세요';
describe('웹 읽기 전용 에이전트 안내', () => {
  it('첫 화면과 llms 및 prompt 앞부분에서 HTML 필수 규칙을 발견한다', () => {
    const assets = buildDiscoveryAssets({ services: [], tools: [] });
    for (const text of [assets['discovery.html'], buildAgentStartText('https://guide.example'), generatePromptText('https://guide.example')]) {
      expect(text.slice(0,2500)).toContain(rule);
      expect(text).toContain('실행할 수 없다고 단정하지');
    }
  });
  it('전체 상세 GET 예시가 HTML 형식이고 JSON 스키마 설명과 혼동하지 않는다', () => {
    const prompt = generatePromptText('https://guide.example');
    const urls = prompt.match(/https:\/\/guide\.example\/api\/[^\s]+/g)!;
    expect(urls.length).toBeGreaterThan(30);
    for (const url of urls) expect(url).toMatch(/[?&]format=html/);
    expect(prompt).not.toContain('아래 상세 REST API 요청은 GET 방식이며, 결과는 JSON으로 반환됩니다.');
    expect(prompt).toContain('기본 JSON 응답의 구조');
  });
  it('HTML 조회 결과에서도 이후 조회 규칙과 개발자용 JSON 구분을 유지한다', async () => {
    const response = await app.request('/api/daiso/products?format=html');
    const text = await response.text();
    expect(text).toContain(rule);
    expect(text).toContain('개발자용 JSON 원본');
    expect(text).toContain('웹 읽기용 아님');
  });
});
