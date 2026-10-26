/** 운영 API와 분리된 고정 데이터 웹 읽기 실험. 개인정보는 기록하지 않습니다. */
type Event = {
  run: string;
  test: string;
  phase: string;
  at: string;
  requestId: string;
  client: string;
};
export type Storage = {
  transaction<T>(callback: (tx: Pick<Storage, 'get' | 'put'>) => Promise<T>): Promise<T>;
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<unknown>;
  setAlarm(at: number): Promise<unknown>;
  deleteAll(): Promise<unknown>;
};
type Env = {
  PROBE_LOG: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
};
const DAY = 86400000;
const CASES = [
  'html',
  'text',
  'json',
  'wallet',
  '지갑',
  'query',
  'redirect',
  'delay1',
  'delay5',
  'delay15',
  'large64',
  'large256',
  'cache',
  'noindex',
  'javascript',
];
const RUN = /^[a-zA-Z0-9-]{1,48}$/;

/** 모든 실험의 최근 128개 기록만 유지하며 24시간 뒤 삭제합니다. */
export class ProbeLog {
  constructor(private state: { storage: Storage }) {}
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const event = (await request.json()) as Event;
      await this.state.storage.transaction(async (tx) => {
        const stored = (await tx.get('events')) as Event[] | undefined;
        const events = (stored ?? []).filter((e) => Date.parse(e.at) > Date.now() - DAY);
        events.push(event);
        await tx.put('events', events.slice(-128));
      });
      await this.state.storage.setAlarm(Date.now() + DAY);
      return new Response('ok');
    }
    const stored = (await this.state.storage.get('events')) as Event[] | undefined;
    const events = (stored ?? []).filter((e) => Date.parse(e.at) > Date.now() - DAY);
    const run = new URL(request.url).searchParams.get('run');
    return Response.json(
      { retention: 'last 128 events, max 24h', events: events.filter((e) => e.run === run) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}

function clientKind(request: Request): string {
  const ua = request.headers.get('user-agent') ?? '';
  if (ua.includes('ChatGPT-User')) return 'chatgpt-user';
  if (ua.includes('OAI-SearchBot')) return 'oai-searchbot';
  if (ua.includes('Mozilla/')) return 'browser';
  return 'other';
}

function html(body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Web Read Lab</title></head><body><h1>Web Read Lab</h1>${body}</body></html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (url.pathname === '/robots.txt')
      return new Response('User-agent: *\nAllow: /\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/') {
      return new Response(
        html(
          '<p>독립 웹 읽기 실험. 모든 상품과 수량은 가상 데이터입니다.</p><p>/run/실험번호 에서 테스트 링크를 확인하세요.</p><a href="/run/start">시작</a>',
        ),
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
      );
    }
    if (!RUN.test(parts[1] ?? '')) return new Response('Invalid run', { status: 400 });
    const run = parts[1];
    const log = env.PROBE_LOG.get(env.PROBE_LOG.idFromName('bounded-log'));
    if (parts[0] === 'observations' && parts.length === 2)
      return log.fetch(new Request(`https://log/?run=${run}`));
    if (parts[0] !== 'run' || parts.length > 3) return new Response('Not found', { status: 404 });
    let test: string;
    try {
      test = decodeURIComponent(parts[2] ?? 'index');
    } catch {
      return new Response('Invalid path', { status: 400 });
    }
    if (test !== 'index' && !CASES.includes(test))
      return new Response('Not found', { status: 404 });
    const requestId = crypto.randomUUID();
    const record = (phase: string) =>
      log.fetch(
        new Request('https://log/', {
          method: 'POST',
          body: JSON.stringify({
            run,
            test,
            phase,
            at: new Date().toISOString(),
            requestId,
            client: clientKind(request),
          }),
        }),
      );
    await record('received');
    if (/^delay(1|5|15)$/.test(test))
      await new Promise((resolve) => setTimeout(resolve, Number(test.slice(5)) * 1000));
    const data = {
      synthetic: true,
      run,
      test,
      requestId,
      generatedAt: new Date().toISOString(),
      name: '실험용 지갑',
      quantity: 7,
    };
    const headers = new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': test === 'cache' ? 'public, max-age=300' : 'no-store',
      'X-Lab-Request-Id': requestId,
    });
    let body = html(
      `<p>가상 실험 데이터, 실제 상품 재고가 아닙니다.</p><pre>${JSON.stringify(data, null, 2)}</pre>`,
    );
    let status = 200;
    if (test === 'index') {
      body = html(
        `<p>가상 상품: 실험용 지갑, 수량7. 실험번호: ${run}</p><ul>${CASES.map((c) => `<li><a href="/run/${run}/${encodeURIComponent(c)}${c === 'query' ? '?q=wallet' : ''}">${c}</a></li>`).join('')}</ul><a href="/run/${run}/query?q=%EC%A7%80%EA%B0%91">한글 쿼리</a><p>응답의 requestId와 generatedAt을 관측 기록과 비교하세요. received는 서버 도착, prepared는 응답 생성 완료이며 클라이언트 수신 성공을 증명하지 않습니다.</p><a href="/observations/${run}">관측 기록 JSON</a><p>현재 요청 번호 ${requestId}</p>`,
      );
    } else if (test === 'json' || test === 'text') {
      headers.set(
        'Content-Type',
        test === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      );
      body = JSON.stringify(data, null, 2);
    } else if (test === 'redirect') {
      headers.set('Location', `/run/${run}/html`);
      status = 302;
    } else if (test === 'javascript') {
      body = html(
        `<p>JavaScript 생성 데이터:</p><div id="result"></div><script>document.getElementById('result').textContent=${JSON.stringify(JSON.stringify(data))};</script>`,
      );
    } else if (test === 'noindex') {
      headers.set('X-Robots-Tag', 'noindex, follow');
    } else if (test === 'large64' || test === 'large256') {
      const targetBytes = (test === 'large64' ? 64 : 256) * 1024;
      const prefix = `<pre>${JSON.stringify(data)}</pre><p>`;
      const suffix = `</p><p>END-MARKER-${requestId}</p>`;
      const paddingBytes = targetBytes - new TextEncoder().encode(html(prefix + suffix)).byteLength;
      body = html(prefix + 'x'.repeat(paddingBytes) + suffix);
    }
    await record('prepared');
    return new Response(request.method === 'HEAD' ? null : body, { status, headers });
  },
};
