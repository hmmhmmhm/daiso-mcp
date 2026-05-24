/**
 * 앱 통합 테스트 - 개발자 요청 수집 API
 */
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('/api/feedback/requests', () => {
  it('POST 요청을 Supabase에 저장한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'request-post',
            type: 'improvement',
            severity: 'medium',
            title: '프롬프트 개선',
            service: 'mcp',
            status: 'open',
            created_at: '2026-05-24T05:20:00.000Z',
          },
        ]),
        { status: 201 },
      ),
    );

    const res = await app.request(
      '/api/feedback/requests',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'improvement',
          severity: 'high',
          title: '프롬프트 개선',
          description: '에이전트가 도구 선택을 더 잘하도록 개선이 필요합니다.',
          service: 'mcp',
          toolName: 'submit_developer_request',
          reproduction: '재현',
          expected: '기대',
          actual: '실제',
          source: 'chatgpt',
        }),
      },
      {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('request-post');
  });

  it('GET 요청으로 Actions facade 제출을 지원한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'request-get',
            type: 'feature',
            severity: 'medium',
            title: '새 기능',
            status: 'open',
            created_at: '2026-05-24T05:30:00.000Z',
          },
        ]),
        { status: 201 },
      ),
    );

    const res = await app.request(
      '/api/actions/query?action=submitDeveloperRequest&type=feature&title=%EC%83%88%20%EA%B8%B0%EB%8A%A5&description=%EC%9A%94%EC%B2%AD%20%EB%82%B4%EC%9A%A9&service=mcp',
      undefined,
      {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('request-get');
  });

  it('제목이나 설명이 없으면 400을 반환한다', async () => {
    const res = await app.request('/api/feedback/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '제목만 있음' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_FEEDBACK_DESCRIPTION');
  });

  it('제목이 없으면 400을 반환한다', async () => {
    const res = await app.request('/api/feedback/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: '설명만 있음' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_FEEDBACK_TITLE');
  });

  it('GET 요청에서 제목이 없으면 400을 반환한다', async () => {
    const res = await app.request('/api/feedback/requests');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_FEEDBACK_TITLE');
  });

  it('깨진 JSON 본문은 빈 요청으로 처리해 필수값 오류를 반환한다', async () => {
    const res = await app.request('/api/feedback/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_FEEDBACK_TITLE');
  });

  it('Supabase 저장 실패를 500으로 반환한다', async () => {
    mockFetch.mockRejectedValue('raw failure');

    const res = await app.request(
      '/api/feedback/requests?title=%EC%98%A4%EB%A5%98&description=%EC%84%A4%EB%AA%85',
      undefined,
      {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      },
    );

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('DEVELOPER_REQUEST_SUBMIT_FAILED');
    expect(data.error.message).toBe('알 수 없는 오류가 발생했습니다.');
  });

  it('Supabase 설정 누락 Error를 500 메시지로 반환한다', async () => {
    const res = await app.request(
      '/api/feedback/requests?title=%EC%98%A4%EB%A5%98&description=%EC%84%A4%EB%AA%85',
    );

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.message).toContain('SUPABASE_URL');
  });
});
