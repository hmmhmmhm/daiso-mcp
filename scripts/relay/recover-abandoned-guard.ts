/** 재시작 전 마커도 파일 정체와 소유 프로세스의 완전 소멸을 확인합니다. */
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { bounded } from './lifecycle.js';
import { processSnapshot, type ProcessIdentity } from './ownership.js';
import { recoverExitedGuard } from './recover-exited-guard.js';
export async function recoverAbandonedGuard(
  markerPath: string,
  deadline: number,
  snapshot = processSnapshot,
): Promise<boolean> {
  const remaining = () => Math.max(0, deadline - Date.now());
  try {
    const handle = await open(
      markerPath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await bounded(handle.stat(), remaining());
      if (
        !stat.isFile() ||
        stat.size > 16384 ||
        stat.uid !== process.getuid!() ||
        stat.mode & 0o077
      )
        return false;
      const marker = JSON.parse(await bounded(handle.readFile('utf8'), remaining()));
      const root = marker?.browser as ProcessIdentity | undefined;
      if (
        !root ||
        !Number.isSafeInteger(marker.guardPid) ||
        marker.guardPid <= 1 ||
        !Number.isSafeInteger(root.pid) ||
        root.pid <= 1 ||
        root.pgid !== root.pid ||
        root.ppid !== marker.guardPid ||
        typeof root.birth !== 'string' ||
        !root.birth ||
        typeof root.crashDir !== 'string' ||
        !root.crashDir.startsWith(markerPath + '.') ||
        !root.crashDir.endsWith('.crashpad')
      )
        return false;
      return await recoverExitedGuard(markerPath, marker.guardPid, root, deadline, snapshot, stat);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}
