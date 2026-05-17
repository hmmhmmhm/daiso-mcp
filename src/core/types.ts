/**
 * 공통 타입 정의
 *
 * 모든 서비스 프로바이더가 사용하는 공통 타입입니다.
 */

import type * as z from 'zod';

/**
 * MCP 도구 응답 형식
 * 모든 도구 핸들러가 반환하는 표준 형식
 */
export interface McpToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  structuredContent?: Record<string, unknown>;
}

/**
 * 도구 핸들러 함수 타입
 */
export type ToolHandler<TArgs = unknown> = (args: TArgs) => Promise<McpToolResponse>;

/**
 * 도구 입력 스키마 타입
 * Zod 스키마 객체 형태
 */
export type ToolInputSchema = Record<string, z.ZodType>;

/**
 * 도구 출력 스키마 타입
 */
export type ToolOutputSchema = Record<string, z.ZodType>;

/**
 * 도구 정의
 * MCP 서버에 등록되는 도구의 메타데이터와 핸들러
 */
export interface ToolDefinition<TArgs = unknown> {
  /** 도구 고유 이름 (예: daiso_search_products) */
  name: string;
  /** 도구 제목 (표시용) */
  title: string;
  /** 도구 설명 */
  description: string;
  /** Zod 스키마 기반 입력 정의 */
  inputSchema: ToolInputSchema;
  /** 도구 핸들러 함수 */
  handler: ToolHandler<TArgs>;
}

/**
 * 서비스 메타데이터
 * 서비스 프로바이더의 기본 정보
 */
export interface ServiceMetadata {
  /** 서비스 고유 ID (예: daiso, cu, cgv) */
  id: string;
  /** 서비스 표시 이름 */
  name: string;
  /** 서비스 버전 */
  version: string;
  /** 서비스 설명 */
  description?: string;
}

/**
 * 도구 등록 정보
 * 서비스에서 반환하는 도구 정보 (간소화 버전)
 */
export interface ToolRegistration {
  /** 도구 이름 (서비스 접두사 포함) */
  name: string;
  /** 도구 메타데이터 */
  metadata: {
    title: string;
    description: string;
    inputSchema: ToolInputSchema;
    outputSchema?: ToolOutputSchema;
  };
  /** 도구 핸들러 */
  handler: ToolHandler;
}

/**
 * 서비스 정보 (API 응답용)
 */
export interface ServiceInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  tools: string[];
}
