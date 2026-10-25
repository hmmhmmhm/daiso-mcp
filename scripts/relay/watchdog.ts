/** 원본 조회 없이 중계 수명을 감시하고 복구 실패 간격을 늘립니다. */
interface RecoverableLifecycle {
  start(): Promise<void>;
  status(): { state: string; active: boolean };
}
export function createRelayWatchdog(
  lifecycle: RecoverableLifecycle,
  onEvent?: (event: string) => void,
  now = Date.now,
) {
  let pending: Promise<void> | undefined;
  let failures = 0;
  let nextAttempt = 0;
  const emit = (event: string) => {
    try {
      onEvent?.(event);
    } catch {
      /* 관측 실패는 수명 관리에 영향을 주지 않습니다. */
    }
  };
  return async () => {
    if (pending) return pending;
    const { state, active } = lifecycle.status();
    if (state === 'ready') {
      failures = 0;
      nextAttempt = 0;
      return;
    }
    if (active || (state !== 'failed' && state !== 'idle') || now() < nextAttempt) return;
    pending = (async () => {
      emit('recovery-started');
      try {
        await lifecycle.start();
        failures = 0;
        nextAttempt = now() + 60000;
        emit('recovery-ready');
      } catch {
        nextAttempt = now() + Math.min(900000, 60000 * 2 ** Math.min(failures++, 4));
        emit('recovery-failed');
      }
    })();
    try {
      await pending;
    } finally {
      pending = undefined;
    }
  };
}
