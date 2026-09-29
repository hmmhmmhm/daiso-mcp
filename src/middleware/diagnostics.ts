/** REST와 MCP의 공통 요청 경계를 기록합니다. */
import type { MiddlewareHandler } from 'hono';
import {
  withDiagnostics,
  diagnosticEvent,
  diagnosticHeaders,
  diagnosticOperation,
} from '../utils/diagnostics.js';
export const diagnosticsMiddleware: MiddlewareHandler = async (c, next) =>
  withDiagnostics(async () => {
    const start = performance.now();
    try {
      await next();
    } finally {
      c.header('x-request-id', diagnosticHeaders()['x-request-id']);
      diagnosticEvent({
        stage: 'request',
        operation: diagnosticOperation(c.req.url),
        outcome: c.error || c.res.status >= 400 ? 'error' : 'ok',
        status: c.res.status,
        durationMs: performance.now() - start,
      });
    }
  });
