/** 접수형 다이소 조회의 취소를 해당 비동기 호출 범위에만 전달합니다. */
import { AsyncLocalStorage } from 'node:async_hooks';
const signals = new AsyncLocalStorage<AbortSignal>();
export const withBrowseReadSignal = <T>(signal: AbortSignal, work: () => T): T =>
  signals.run(signal, work);
export function browseReadSignal(signal?: AbortSignal | null): AbortSignal | undefined {
  const scoped = signals.getStore();
  return scoped && signal ? AbortSignal.any([signal, scoped]) : (scoped ?? signal ?? undefined);
}
