/** 읽기 결과만 잠시 저장합니다. 요청 헤더·인증값·원본 호출 조건은 저장하지 않습니다. */
export const BROWSE_JOB_TTL = 300000;
export const BROWSE_JOB_DEADLINE = 25000;
export type ReadSnapshot = { status: number; body: string; contentType: string };
type Job = {
  status: 'pending' | 'ready';
  createdAt: number;
  completedAt?: string;
  response?: ReadSnapshot;
};
export const expiredReadSnapshot = (): ReadSnapshot => ({
  status: 504,
  contentType: 'text/html; charset=utf-8',
  body: '<h1>조회가 제한 시간 안에 완료되지 않았습니다.</h1><p>수량은 미확인입니다. 접수는 재고 조회 성공이 아닙니다.</p>',
});

function validSnapshot(input: unknown): input is ReadSnapshot {
  if (!input || typeof input !== 'object') return false;
  const v = input as ReadSnapshot;
  return (
    Number.isInteger(v.status) &&
    v.status >= 200 &&
    v.status <= 599 &&
    ![204, 205, 304].includes(v.status) &&
    typeof v.body === 'string' &&
    new TextEncoder().encode(v.body).length <= 262144 &&
    typeof v.contentType === 'string' &&
    v.contentType.length <= 128 &&
    !/[\r\n]/.test(v.contentType)
  );
}

export class BrowseReadJob {
  constructor(private readonly state: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const storage = this.state.storage;
    const current = await storage.get<Job>('job');
    if (request.method === 'GET') {
      if (!current || Date.now() >= current.createdAt + BROWSE_JOB_TTL)
        return new Response(null, { status: 404 });
      return Response.json(current);
    }
    if (request.method === 'POST' && path === '/start') {
      if (current) return new Response(null, { status: 409 });
      await storage.put('job', { status: 'pending', createdAt: Date.now() });
      await storage.setAlarm(Date.now() + BROWSE_JOB_DEADLINE);
      return new Response(null, { status: 201 });
    }
    if (request.method !== 'POST' || path !== '/complete')
      return new Response(null, { status: 405 });
    let input: unknown;
    try {
      input = JSON.parse(await request.text());
    } catch {
      return new Response(null, { status: 400 });
    }
    if (!validSnapshot(input)) return new Response(null, { status: 400 });
    const accepted = await storage.transaction(async (tx) => {
      const job = await tx.get<Job>('job');
      if (!job || job.status !== 'pending' || Date.now() >= job.createdAt + BROWSE_JOB_TTL)
        return false;
      await tx.put('job', {
        ...job,
        status: 'ready',
        completedAt: new Date().toISOString(),
        response: input,
      });
      return true;
    });
    return new Response(null, { status: accepted ? 200 : 409 });
  }
  async alarm(): Promise<void> {
    const job = await this.state.storage.get<Job>('job');
    if (!job || Date.now() >= job.createdAt + BROWSE_JOB_TTL) {
      await this.state.storage.deleteAll();
      return;
    }
    if (job.status === 'pending' && Date.now() >= job.createdAt + BROWSE_JOB_DEADLINE) {
      await this.state.storage.put('job', {
        ...job,
        status: 'ready',
        completedAt: new Date().toISOString(),
        response: expiredReadSnapshot(),
      });
    }
    await this.state.storage.setAlarm(
      job.createdAt +
        (Date.now() < job.createdAt + BROWSE_JOB_DEADLINE ? BROWSE_JOB_DEADLINE : BROWSE_JOB_TTL),
    );
  }
}
