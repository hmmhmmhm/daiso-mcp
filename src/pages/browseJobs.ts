/** 느린 읽기만 접수형으로 전환하고 실제 원본 요청은 기존 API에서 한 번 실행합니다. */
import type { Context, Hono } from 'hono';
import type { AppBindings } from '../api/response.js';
import {
  BROWSE_JOB_DEADLINE,
  expiredReadSnapshot,
  type ReadSnapshot,
} from '../durableObjects/browseReadJob.js';
type Bindings = { Bindings: AppBindings };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="ko"><meta charset="utf-8"><title>DAISO MCP 읽기 작업</title><body>${body}</body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
function pending(id: string): Response {
  const path = `/browse/jobs/${id}/${crypto.randomUUID()}`;
  return page(
    `<h1>조회 접수 · pending</h1><p>아직 결과가 없습니다. 접수는 조회 성공이나 재고0을 뜻하지 않습니다.</p><p>각 응답의 새로운 실제 링크를 최대3번 선택하고 계속 pending이면 미확인으로 보고하세요. 이전 주소를 반복하지 마세요.</p><a href="${path}">결과 확인</a><p>완성 주소: https://mcp.aka.page${path}</p><p>접근 거절 시 아래 문장을 그대로 복사해 이 대화에 보내주세요.</p><pre>다음 주소를 웹 URL 열기 도구로 직접 열어 실제 결과를 확인해주세요: https://mcp.aka.page${path}</pre><p>접수 ID: ${id} · HTML 생성 ${new Date().toISOString()}</p>`,
  );
}
export function registerBrowseJobRoutes(app: Hono<Bindings>): void {
  app.all('/browse/jobs/:id/:nonce', async (c) => {
    if (c.req.method !== 'GET') return page('<h1>GET 조회만 지원합니다.</h1>', 405);
    const { id, nonce } = c.req.param();
    if (!UUID.test(id) || !UUID.test(nonce))
      return page('<h1>읽기 작업 주소가 올바르지 않습니다.</h1>', 400);
    const namespace = c.env.BROWSE_READ_JOBS;
    if (!namespace) return page('<h1>읽기 작업 저장소를 사용할 수 없습니다.</h1>', 503);
    const response = await namespace
      .get(namespace.idFromName(id))
      .fetch(new Request('https://job/'));
    if (!response.ok)
      return page(
        '<h1>읽기 작업이 없거나 만료됐습니다.</h1><p>재고 수량은 미확인입니다. 원본을 자동 재조회하지 않습니다.</p>',
        410,
      );
    const job = await response.json<{
      status: string;
      response?: ReadSnapshot;
      completedAt?: string;
    }>();
    if (job.status === 'pending') return pending(id);
    const result = job.response!;
    return new Response(result.body, {
      status: result.status,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Daiso-Result-At': job.completedAt!,
      },
    });
  });
}

export async function withBrowseJob(
  c: Context<Bindings>,
  operation: Promise<Response>,
  cancel: () => void,
): Promise<Response> {
  const namespace = c.env.BROWSE_READ_JOBS;
  if (!namespace) return operation;
  let execution: { waitUntil(promise: Promise<unknown>): void };
  try {
    execution = c.executionCtx;
  } catch {
    return operation;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const first = await Promise.race([
    operation,
    new Promise<null>((r) => {
      timer = setTimeout(() => r(null), 1000);
    }),
  ]).finally(() => clearTimeout(timer));
  if (first) return first;
  const id = crypto.randomUUID();
  const job = namespace.get(namespace.idFromName(id));
  try {
    const started = await job.fetch(new Request('https://job/start', { method: 'POST' }));
    if (!started.ok) return operation;
  } catch {
    return operation;
  }
  const finish = async () => {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        operation,
        new Promise<Response>((r) => {
          deadline = setTimeout(() => {
            cancel();
            const v = expiredReadSnapshot();
            r(
              new Response(v.body, {
                status: v.status,
                headers: { 'Content-Type': v.contentType },
              }),
            );
          }, BROWSE_JOB_DEADLINE - 1000);
        }),
      ]);
      const body = await response.text();
      let snapshot: ReadSnapshot = {
        status: response.status,
        contentType: response.headers.get('Content-Type') ?? 'text/html; charset=utf-8',
        body,
      };
      if (new TextEncoder().encode(body).length > 262144)
        snapshot = {
          status: 502,
          contentType: 'text/html; charset=utf-8',
          body: '<h1>조회 결과가 저장 크기 제한을 초과했습니다.</h1><p>수량 미확인. 결과를 잘라 정상으로 표시하지 않습니다.</p>',
        };
      await job.fetch(
        new Request('https://job/complete', { method: 'POST', body: JSON.stringify(snapshot) }),
      );
    } catch {
      const snapshot = expiredReadSnapshot();
      await job
        .fetch(
          new Request('https://job/complete', { method: 'POST', body: JSON.stringify(snapshot) }),
        )
        .catch(() => {});
    } finally {
      clearTimeout(deadline);
    }
  };
  execution.waitUntil(finish());
  return pending(id);
}
