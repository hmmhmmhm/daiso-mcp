/**
 * API 공통 응답 유틸리티
 */

import type { Context } from 'hono';

export interface AppBindings {
  ZYTE_API_KEY?: string;
  GOOGLE_MAPS_API_KEY?: string;
  HEALTH_CHECK_SECRET?: string;
  HEALTH_CHECK_BASE_URL?: string;
}

export type ApiContext = Context<{ Bindings: AppBindings }>;

/** API 응답 형식 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

/**
 * 성공 응답 생성
 */
export function successResponse<T>(c: ApiContext, data: T, meta?: ApiResponse<T>['meta']) {
  return c.json<ApiResponse<T>>({
    success: true,
    data,
    meta,
  });
}

/**
 * 에러 응답 생성
 */
export function errorResponse(
  c: ApiContext,
  code: string,
  message: string,
  status: 400 | 401 | 403 | 404 | 500 | 503 = 400,
) {
  return c.json<ApiResponse<never>>(
    {
      success: false,
      error: { code, message },
    },
    status,
  );
}
