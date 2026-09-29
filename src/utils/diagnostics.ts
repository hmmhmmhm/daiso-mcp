/** 비밀값과 원문 없이 요청 경계를 연결하는 진단 컨텍스트입니다. */
import { AsyncLocalStorage } from 'node:async_hooks';
interface DiagnosticContext {
  requestId: string;
  sampled: boolean;
  events: number;
  consumerIdentity?: string;
}
const context = new AsyncLocalStorage<DiagnosticContext>();
export interface DiagnosticEvent {
  stage: 'request' | 'tool' | 'http' | 'relay';
  outcome: 'ok' | 'error' | 'retry';
  operation?: string;
  status?: number;
  durationMs?: number;
}
export function withDiagnostics<T>(work: () => T, consumerIdentity?: string): T {
  if (context.getStore()) return work();
  return context.run(
    { requestId: crypto.randomUUID(), sampled: Math.random() < 0.01, events: 0, consumerIdentity },
    work,
  );
}
export function diagnosticHeaders(): Record<string, string> {
  const current = context.getStore();
  return current ? { 'x-request-id': current.requestId } : {};
}
export function diagnosticEvent(event: DiagnosticEvent): void {
  const current = context.getStore();
  // 요청당 상한으로 재시도/팬아웃 로그가 무한히 늘어나지 않게 합니다.
  if (!current || (event.outcome === 'ok' && !current.sampled) || current.events >= 32) return;
  current.events++;
  console.error(
    JSON.stringify({
      event: 'diagnostic',
      time: new Date().toISOString(),
      requestId: current.requestId,
      stage: event.stage,
      outcome: event.outcome,
      operation: event.operation,
      status: event.status,
      durationMs: event.durationMs,
    }),
  );
}
const services = new Set([
  'daiso',
  'oliveyoung',
  'dtryx',
  'gs25',
  'cu',
  'seveneleven',
  'emart24',
  'lottemart',
  'cgv',
  'megabox',
  'lottecinema',
  'opinet',
  'places',
  'compare',
  'feedback',
  'health',
  'rate-limit',
  'actions',
]);
const operations = new Set([
  'products',
  'stores',
  'inventory',
  'movies',
  'theaters',
  'timetable',
  'play-dates',
  'seats',
  'remaining-seats',
  'average',
  'lowest',
  'requests',
  'checks',
  'stats',
  'query',
  'popwords',
  'price',
]);
export function diagnosticOperation(url: string): string {
  const parts = new URL(url).pathname.split('/');
  if (parts[1] === 'mcp') return 'mcp';
  if (parts[1] === 'api' && services.has(parts[2]) && operations.has(parts[3]))
    return `${parts[2]}.${parts[3]}`;
  return 'other';
}

/** 릴레이 전용 일별 익명 식별자이며 로그나 공개 응답에는 포함하지 않습니다. */
export async function relayConsumer(token: string): Promise<string | undefined> {
  const identity = context.getStore()?.consumerIdentity;
  if (!identity) return undefined;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(token),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key,
    encoder.encode(`${Math.floor(Date.now() / 86400000)}:${identity}`));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}
