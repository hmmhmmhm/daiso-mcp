/** 고정 가상 작업만 저장하며 운영 데이터나 임의 URL을 받지 않습니다. */
import type { Storage } from './worker.js';
const DAY = 86400000;
type Job = {
  jobId: string;
  status: 'pending' | 'ready';
  acceptedAt: number;
  readyAt: number;
  completedAt?: string;
  resultId?: string;
  quantity?: number;
};

export async function completeJob(storage: Storage): Promise<void> {
  await storage.transaction(async (tx) => {
    const job = (await tx.get('job')) as Job | undefined;
    if (job?.status === 'pending' && Date.now() >= job.readyAt) {
      await tx.put('job', {
        ...job,
        status: 'ready',
        completedAt: new Date().toISOString(),
        resultId: crypto.randomUUID(),
        quantity: 7,
      });
    }
  });
}

export async function alarmJob(storage: Storage): Promise<void> {
  const job = (await storage.get('job')) as Job | undefined;
  if (!job || Date.now() >= job.acceptedAt + DAY) {
    await storage.deleteAll();
    return;
  }
  await completeJob(storage);
  await storage.setAlarm(Date.now() < job.readyAt ? job.readyAt : job.acceptedAt + DAY);
}

export async function jobResponse(storage: Storage, mode: string): Promise<Response> {
  const now = Date.now();
  let created = false;
  const job = await storage.transaction(async (tx) => {
    const old = (await tx.get('job')) as Job | undefined;
    if (old && now < old.acceptedAt + DAY) return old;
    if (mode === 'result5') return undefined;
    const next: Job = {
      jobId: crypto.randomUUID(),
      status: 'pending',
      acceptedAt: now,
      readyAt: now + 5000,
    };
    await tx.put('job', next);
    created = true;
    return next;
  });
  if (!job) return Response.json({ status: 'not-found' }, { status: 404 });
  if (created) await storage.setAlarm(job.readyAt);
  if (mode === 'cold5' && job.status === 'pending') {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, job.readyAt - Date.now())));
    await completeJob(storage);
    await storage.setAlarm(job.acceptedAt + DAY);
  }
  const current = (await storage.get('job')) as Job;
  return Response.json({ ...current, cacheHit: !created && current.status === 'ready' });
}
