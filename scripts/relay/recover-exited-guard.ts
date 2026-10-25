/** 종료한 감시자의 소유 프로세스가 모두 사라진 경우에만 실패 마커를 보존 이동합니다. */
import { constants } from 'node:fs';
import { open, lstat, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { bounded } from './lifecycle.js';
import { hasOwnedProcesses, processSnapshot, type ProcessIdentity } from './ownership.js';
export async function recoverExitedGuard(
  markerPath: string,
  guardPid: number,
  root: ProcessIdentity,
  deadline: number,
  snapshot = processSnapshot,
  expected?: { dev: number; ino: number },
): Promise<boolean> {
  const remaining = () => Math.max(0, deadline - Date.now());
  try {
    if (!root.crashDir || !root.crashDir.startsWith(markerPath + '.')) return false;
    const handle = await open(
      markerPath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await bounded(handle.stat(), remaining());
      if (expected && (expected.dev !== stat.dev || expected.ino !== stat.ino)) return false;
      if (!stat.isFile() || stat.size > 16384 || stat.uid !== process.getuid!()) return false;
      const marker = JSON.parse(await bounded(handle.readFile('utf8'), remaining()));
      if (marker?.guardPid !== guardPid) return false;
      for (const key of ['pid', 'pgid', 'birth', 'crashDir'] as const)
        if (marker.browser?.[key] !== root[key]) return false;
      const rows = await bounded(snapshot(), remaining());
      if (rows.some((row) => row.pid === guardPid || row.pid === root.pid)) return false;
      if (hasOwnedProcesses(root, rows)) return false;
      const current = await bounded(lstat(markerPath), remaining());
      if (current.dev !== stat.dev || current.ino !== stat.ino) return false;
      if (!remaining()) return false;
      // 완료 전 잠금을 해제하지 않도록 커밋 중인 파일 이동 자체는 기다립니다.
      await rename(markerPath, `${markerPath}.exited-${randomUUID()}`);
      return true;
    } finally {
      await handle.close();
    }
  } catch {
    // 소유권·파일·조회 기한 중 하나라도 확인할 수 없으면 기존 실패 상태를 유지합니다.
    return false;
  }
}
