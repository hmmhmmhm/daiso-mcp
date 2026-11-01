/** 실행 환경 태그까지 두 번 확인하여 시작 도중 종료한 감시자의 기록만 보존합니다. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, rename } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { bounded } from './lifecycle.js';
import { processSnapshot } from './ownership.js';
export function environmentSnapshotArgs(platform: string, uid: number): string[] {
  return [platform === 'darwin' ? '-Eww' : 'eww', '-U', String(uid), '-o', 'pid=,command='];
}
/** 원문 환경은 반환하거나 기록하지 않고 해당 태그·PID의 존재 여부만 반환합니다. */
export async function processReferencesDirectory(
  directory: string,
  guardPid: number,
  deadline: number,
  capture: (
    args: string[],
    options: { timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv },
  ) => Promise<{ stdout: string }> = (args, options) =>
    promisify(execFile)('/bin/ps', args, options),
): Promise<boolean> {
  const nonce = randomUUID();
  const { stdout } = await capture(environmentSnapshotArgs(process.platform, process.getuid!()), {
    timeout: Math.max(1, Math.min(2000, deadline - Date.now())),
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, DAISO_RECOVERY_SNAPSHOT: nonce },
  });
  const containsPid = (pid: number) => new RegExp(`^\\s*${pid}\\s`, 'm').test(stdout);
  // 환경 조회 자체가 생략되거나 불완전한 관측이면 회수를 거절합니다.
  if (!containsPid(process.pid) || !stdout.includes(`DAISO_RECOVERY_SNAPSHOT=${nonce}`))
    throw new Error('Incomplete process environment snapshot');
  return containsPid(guardPid) || stdout.includes(directory);
}
export async function recoverLaunchingGuard(
  markerPath: string,
  raw: string,
  expected: { dev: number; ino: number },
  deadline: number,
  snapshot = processSnapshot,
  references = processReferencesDirectory,
): Promise<boolean> {
  const remaining = () => Math.max(0, deadline - Date.now());
  const marker = JSON.parse(raw);
  const crashDir = marker.crashDir;
  if (
    !Number.isSafeInteger(marker.guardPid) ||
    marker.guardPid <= 1 ||
    typeof crashDir !== 'string' ||
    dirname(crashDir) !== dirname(markerPath) ||
    !basename(crashDir).startsWith(basename(markerPath) + '.') ||
    !/\.[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.crashpad$/i.test(crashDir)
  )
    return false;
  const handle = await open(
    markerPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await bounded(handle.stat(), remaining());
    if (stat.dev !== expected.dev || stat.ino !== expected.ino) return false;
    for (let round = 0; round < 2; round++) {
      const rows = await bounded(snapshot(), remaining());
      if (rows.some((row) => row.pid === marker.guardPid || row.command?.includes(crashDir)))
        return false;
      if (await bounded(references(crashDir, marker.guardPid, deadline), remaining())) return false;
    }
    const content = Buffer.alloc(Buffer.byteLength(raw));
    await bounded(handle.read(content, 0, content.length, 0), remaining());
    if (content.toString() !== raw || (await handle.stat()).size !== content.length) return false;
    const current = await bounded(lstat(markerPath), remaining());
    if (current.dev !== stat.dev || current.ino !== stat.ino || !remaining()) return false;
    await rename(markerPath, `${markerPath}.exited-${randomUUID()}`);
    return true;
  } finally {
    await handle.close();
  }
}
