/** 독립 감시 프로세스와 연결하고 소유 브라우저의 종료 확인을 기다립니다. */
import { recoverExitedGuard } from './recover-exited-guard.js';
import { recoverAbandonedGuard } from './recover-abandoned-guard.js';
import { existsSync } from 'node:fs';
import { acquireMarkerLease } from './marker-lease.js';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { bounded, type BrowserOwner } from './lifecycle.js';
import { ownedGroup, processSnapshot, type ProcessIdentity } from './ownership.js';

export async function launchGuardedBrowser(
  markerPath: string,
  onEvent?: (reason: string) => void | Promise<void>,
  browserExecutable?: string,
  browserMode?: 'headless' | 'headed',
): Promise<BrowserOwner> {
  const release = await acquireMarkerLease(markerPath);
  markerPath = release.markerPath;
  let starting = true;
  const serial = async (action: () => Promise<boolean>) => {
    if (starting) return action();
    const unlock = await acquireMarkerLease(markerPath);
    try {
      return await action();
    } finally {
      await unlock();
    }
  };
  try {
    return await launchWhileLocked(markerPath, serial, onEvent, browserExecutable, browserMode);
  } finally {
    starting = false;
    await release();
  }
}
async function launchWhileLocked(
  markerPath: string,
  serial: (action: () => Promise<boolean>) => Promise<boolean>,
  onEvent?: (reason: string) => void | Promise<void>,
  browserExecutable?: string,
  browserMode?: 'headless' | 'headed',
): Promise<BrowserOwner> {
  const emit = (reason: string) => {
    try {
      void Promise.resolve(onEvent?.(reason)).catch(() => undefined);
    } catch {
      /* 관측 실패를 격리합니다. */
    }
  };
  if (existsSync(markerPath)) {
    if (!(await recoverAbandonedGuard(markerPath, Date.now() + 5000))) {
      emit('abandoned-marker-blocked');
      throw new Error('Existing browser ownership unconfirmed');
    }
    emit('abandoned-marker-recovered');
  }
  const guard = fork(
    fileURLToPath(new URL('./guard.ts', import.meta.url)),
    [markerPath, ...(browserExecutable ? [browserMode ?? 'headless', browserExecutable] : [])],
    {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  let exited = false;
  let exitCode: number | null | undefined;
  const exit = new Promise<number | null>((resolve) =>
    guard.once('exit', (code) => {
      exited = true;
      exitCode = code;
      emit(
        code === 0 ? 'guard-exit-normal' : code === null ? 'guard-exit-signal' : 'guard-exit-error',
      );
      resolve(code);
    }),
  );
  let readyRoot: ProcessIdentity | undefined;
  let closing: Promise<void> | undefined;
  const closed = (deadline = Date.now() + 9000): Promise<void> => {
    closing ??= (async () => {
      if (!exited && guard.connected) guard.send({ type: 'close', deadline });
      const code = await bounded(exit, Math.max(0, deadline - Date.now()));
      if (code === 0) return;
      if (
        typeof code === 'number' &&
        readyRoot &&
        guard.pid &&
        (await serial(() => recoverExitedGuard(markerPath, guard.pid!, readyRoot!, deadline)))
      )
        return;
      throw new Error('Browser guard cleanup unconfirmed');
    })();
    return closing;
  };
  try {
    const ready = await bounded(
      new Promise<{ endpoint: string; root: ProcessIdentity }>((resolve, reject) => {
        guard.once('error', reject);
        guard.on('message', (message) => {
          const data = message as { type: string; endpoint: string; root: ProcessIdentity };
          if (data.type === 'ready') resolve(data);
        });
        void exit.then(() => reject(new Error('Browser guard exited before ready')));
      }),
      40000,
    );
    readyRoot = ready.root;
    const browser = await bounded(chromium.connect(ready.endpoint), 10000);
    return {
      browser,
      pid: ready.root.pid,
      close: closed,
      async recover(deadline) {
        // 원래 종료 기한을 늘리지 않고 후속 작업에서 확인된 종료만 재검증합니다.
        if (!exited || exitCode === null || !guard.pid) return false;
        if (exitCode === 0) return true;
        return serial(() => recoverExitedGuard(markerPath, guard.pid!, ready.root, deadline));
      },
      rss: async () =>
        ownedGroup(ready.root, await processSnapshot()).reduce((sum, row) => sum + row.rss, 0),
    };
  } catch (error) {
    await closed();
    throw error;
  }
}
