/** 독립 감시 프로세스와 연결하고 소유 브라우저의 종료 확인을 기다립니다. */
import { recoverExitedGuard } from './recover-exited-guard.js';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { bounded, type BrowserOwner } from './lifecycle.js';
import { ownedGroup, processSnapshot, type ProcessIdentity } from './ownership.js';

export async function launchGuardedBrowser(markerPath: string): Promise<BrowserOwner> {
  const guard = fork(fileURLToPath(new URL('./guard.ts', import.meta.url)), [markerPath], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let exited = false;
  const exit = new Promise<number | null>((resolve) =>
    guard.once('exit', (code) => {
      exited = true;
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
        (await recoverExitedGuard(markerPath, guard.pid, readyRoot, deadline))
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
      rss: async () =>
        ownedGroup(ready.root, await processSnapshot()).reduce((sum, row) => sum + row.rss, 0),
    };
  } catch (error) {
    await closed();
    throw error;
  }
}
