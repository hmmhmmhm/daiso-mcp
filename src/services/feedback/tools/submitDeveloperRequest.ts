import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { submitDeveloperRequest } from '../client.js';
import type { DeveloperRequestConfig, DeveloperRequestInput } from '../types.js';

export function createSubmitDeveloperRequestTool(config: DeveloperRequestConfig): ToolRegistration {
  return {
    name: 'submit_developer_request',
    metadata: {
      title: '개발자 요청 제출',
      description:
        'MCP 기능 오류, 개선 요청, 신규 기능 요청, 문서 문제를 개발자에게 전달하고 Supabase에 저장합니다.',
      inputSchema: {
        type: z
          .enum(['bug', 'improvement', 'feature', 'docs', 'other'])
          .optional()
          .default('other')
          .describe('요청 유형'),
        severity: z
          .enum(['low', 'medium', 'high', 'critical'])
          .optional()
          .default('medium')
          .describe('영향도'),
        title: z.string().describe('짧은 제목'),
        description: z.string().describe('요청 상세 설명'),
        service: z.string().optional().describe('관련 서비스 ID 또는 영역'),
        toolName: z.string().optional().describe('관련 MCP 도구 이름'),
        reproduction: z.string().optional().describe('재현 방법'),
        expected: z.string().optional().describe('기대 결과'),
        actual: z.string().optional().describe('실제 결과'),
        source: z
          .enum(['mcp', 'chatgpt', 'claude', 'cli', 'api', 'other'])
          .optional()
          .default('mcp')
          .describe('요청 출처'),
        userContext: z.object({}).loose().optional().describe('추가 컨텍스트 JSON'),
      },
      outputSchema: {
        id: z.string().optional(),
        type: z.string().optional(),
        severity: z.string().optional(),
        title: z.string().optional(),
        service: z.string().optional(),
        toolName: z.string().optional(),
        source: z.string().optional(),
        status: z.string().optional(),
        createdAt: z.string().optional(),
      },
    },
    handler: (async (args: DeveloperRequestInput): Promise<McpToolResponse> => {
      const result = await submitDeveloperRequest(args, config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: { ...result },
      };
    }) as (args: unknown) => Promise<McpToolResponse>,
  };
}
