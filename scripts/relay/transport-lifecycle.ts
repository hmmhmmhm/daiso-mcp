/** HTTP 경로에서는 Playwright 모듈 자체를 불러오지 않습니다. */
import { join } from 'node:path';
import { lstat } from 'node:fs/promises';
export async function createTransportLifecycle(
  mode: string | undefined,
  stateDir: string,
  onEvent?: (reason: string) => void | Promise<void>,
) {
  if (mode === 'http') {
    const { createHttpLifecycle } = await import('./http-lifecycle.js');
    return createHttpLifecycle();
  }
  if (mode !== undefined && mode !== 'browser')
    throw new Error('OY_RELAY_TRANSPORT 값이 잘못되었습니다.');
  const { createBrowserLifecycle } = await import('./lifecycle.js');
  const { launchGuardedBrowser } = await import('./supervisor.js');
  const paths = ['browser-owner.json', 'browser-owner-replacement.json'].map((name) =>
    join(stateDir, name),
  );
  const occupied = [false, false];
  let failed: unknown;
  const absent = async (path: string) => {
    try {
      await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    throw new Error('Browser ownership marker already exists');
  };
  let initial: Promise<void> | undefined;
  return createBrowserLifecycle(async () => {
    if (failed) throw failed;
    const slot = occupied.indexOf(false);
    if (slot < 0) throw new Error('Browser slots occupied');
    initial ??= Promise.all(paths.map(absent)).then(() => undefined);
    occupied[slot] = true;
    try {
      await initial;
      await absent(paths[slot]);
      if (failed) throw failed;
      const owner = await launchGuardedBrowser(paths[slot]);
      let closing: Promise<void> | undefined;
      return {
        ...owner,
        close(deadline?: number) {
          closing ??= owner
            .close(deadline)
            .then(() => {
              occupied[slot] = false;
            })
            .catch((error) => {
              failed = error;
              throw error;
            });
          return closing;
        },
      };
    } catch (error) {
      // 실행 실패도 소유권 불확실성으로 취급하며 어느 슬롯도 우회하지 않습니다.
      failed = error;
      throw error;
    }
  }, onEvent);
}
