/**
 * 개발자 요청 수집 서비스 테스트
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFeedbackService } from '../../../src/services/feedback/index.js';
import { submitDeveloperRequest } from '../../../src/services/feedback/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createFeedbackService', () => {
  it('개발자 요청 제출 MCP 도구를 등록한다', () => {
    const service = createFeedbackService({
      supabaseUrl: 'https://project.supabase.co',
      supabaseServiceRoleKey: 'service-role-key',
    });

    expect(service.metadata.id).toBe('feedback');
    expect(service.getTools().map((tool) => tool.name)).toEqual(['submit_developer_request']);
  });

  it('Supabase REST API에 개발자 요청을 저장한다', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'request-1',
            type: 'bug',
            severity: 'high',
            title: '올리브영 재고 오류',
            service: 'oliveyoung',
            tool_name: 'oliveyoung_check_inventory',
            source: 'mcp',
            status: 'open',
            created_at: '2026-05-24T05:00:00.000Z',
          },
        ]),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await submitDeveloperRequest(
      {
        type: 'bug',
        severity: 'high',
        title: '올리브영 재고 오류',
        description: '재고 도구가 빈 결과를 반환합니다.',
        service: 'oliveyoung',
        toolName: 'oliveyoung_check_inventory',
        source: 'mcp',
      },
      {
        supabaseUrl: 'https://project.supabase.co',
        supabaseServiceRoleKey: 'service-role-key',
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/agent_requests',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'service-role-key',
          Authorization: 'Bearer service-role-key',
          Prefer: 'return=representation',
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      type: 'bug',
      severity: 'high',
      title: '올리브영 재고 오류',
      description: '재고 도구가 빈 결과를 반환합니다.',
      tool_name: 'oliveyoung_check_inventory',
      status: 'open',
    });
    expect(result).toEqual({
      id: 'request-1',
      type: 'bug',
      severity: 'high',
      title: '올리브영 재고 오류',
      service: 'oliveyoung',
      toolName: 'oliveyoung_check_inventory',
      source: 'mcp',
      status: 'open',
      createdAt: '2026-05-24T05:00:00.000Z',
    });
  });

  it('필수 Supabase 설정이 없으면 저장하지 않고 실패한다', async () => {
    await expect(
      submitDeveloperRequest(
        {
          title: '요청',
          description: '설명이 필요합니다.',
        },
        { supabaseUrl: '', supabaseServiceRoleKey: '' },
      ),
    ).rejects.toThrow('SUPABASE_URL');
  });

  it('제목이 비어 있으면 저장하지 않고 실패한다', async () => {
    await expect(
      submitDeveloperRequest(
        {
          title: '   ',
          description: '설명이 필요합니다.',
        },
        {
          supabaseUrl: 'https://project.supabase.co',
          supabaseServiceRoleKey: 'service-role-key',
        },
      ),
    ).rejects.toThrow('title');
  });

  it('선택 필드와 userContext를 Supabase 행에 포함한다', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'request-object',
          title: '긴 요청',
          status: 'open',
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await submitDeveloperRequest(
      {
        type: 'invalid',
        severity: 'invalid',
        title: '긴 요청',
        description: '설명',
        service: 'mcp',
        toolName: 'submit_developer_request',
        reproduction: '재현',
        expected: '기대',
        actual: '실제',
        source: 'invalid',
        userContext: { host: 'test' },
      },
      {
        supabaseUrl: 'https://project.supabase.co/',
        supabaseServiceRoleKey: 'service-role-key',
      },
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      type: 'other',
      severity: 'medium',
      service: 'mcp',
      tool_name: 'submit_developer_request',
      reproduction: '재현',
      expected: '기대',
      actual: '실제',
      user_context: { host: 'test' },
    });
    expect(result).toMatchObject({
      id: 'request-object',
      type: 'other',
      severity: 'medium',
      service: 'mcp',
      toolName: 'submit_developer_request',
    });
  });

  it('긴 제목은 잘라 저장하고 Supabase가 일부 필드를 생략하면 입력값으로 보완한다', async () => {
    const longTitle = '가'.repeat(200);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            type: 'docs',
            severity: 'low',
            source: 'api',
            created_at: '2026-05-24T06:00:00.000Z',
          },
        ]),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await submitDeveloperRequest(
      {
        type: 'docs',
        severity: 'low',
        title: longTitle,
        description: '문서 설명',
        source: 'api',
      },
      {
        supabaseUrl: 'https://project.supabase.co',
        supabaseServiceRoleKey: 'service-role-key',
      },
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.title).toHaveLength(160);
    expect(result).toMatchObject({
      id: '',
      title: '가'.repeat(160),
      status: 'open',
      createdAt: '2026-05-24T06:00:00.000Z',
    });
  });

  it('Supabase 실패 응답을 오류로 변환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('denied', { status: 403 })),
    );

    await expect(
      submitDeveloperRequest(
        {
          title: '요청',
          description: '설명',
        },
        {
          supabaseUrl: 'https://project.supabase.co',
          supabaseServiceRoleKey: 'service-role-key',
        },
      ),
    ).rejects.toThrow('Supabase 저장 실패: 403 denied');
  });

  it('Supabase 실패 응답 본문을 읽을 수 없어도 상태 코드를 유지한다', async () => {
    const response = new Response('denied', { status: 500 });
    vi.spyOn(response, 'text').mockRejectedValue(new Error('body failed'));
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(
      submitDeveloperRequest(
        {
          title: '요청',
          description: '설명',
        },
        {
          supabaseUrl: 'https://project.supabase.co',
          supabaseServiceRoleKey: 'service-role-key',
        },
      ),
    ).rejects.toThrow('Supabase 저장 실패: 500');
  });

  it('Supabase 저장 결과가 비어 있으면 실패한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([]), { status: 201 })),
    );

    await expect(
      submitDeveloperRequest(
        {
          title: '요청',
          description: '설명',
        },
        {
          supabaseUrl: 'https://project.supabase.co',
          supabaseServiceRoleKey: 'service-role-key',
        },
      ),
    ).rejects.toThrow('Supabase 저장 결과가 비어 있습니다.');
  });

  it('MCP 도구 핸들러는 저장 결과를 structuredContent로 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: 'request-2',
              type: 'feature',
              severity: 'medium',
              title: '가격 비교 개선',
              status: 'open',
              created_at: '2026-05-24T05:10:00.000Z',
            },
          ]),
          { status: 201 },
        ),
      ),
    );
    const service = createFeedbackService({
      supabaseUrl: 'https://project.supabase.co',
      supabaseServiceRoleKey: 'service-role-key',
    });
    const tool = service.getTools()[0];

    const result = await tool.handler({
      type: 'feature',
      title: '가격 비교 개선',
      description: '행사가 비교도 필요합니다.',
    });

    expect(result.structuredContent).toMatchObject({
      id: 'request-2',
      type: 'feature',
      status: 'open',
    });
    expect(result.content[0]?.text).toContain('"id": "request-2"');
  });
});
