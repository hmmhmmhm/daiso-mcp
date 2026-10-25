/** 파일 잠금 대신 OS가 종료 시 해제하는 로컬 포트로 마커 변경을 직렬화합니다. */
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { realpath } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
export function markerLeasePort(markerPath: string): number {
  return 49152 + (createHash('sha256').update(markerPath).digest().readUInt16BE(0) % 16384);
}
export async function acquireMarkerLease(
  markerPath: string,
): Promise<(() => Promise<void>) & { markerPath: string }> {
  markerPath = join(await realpath(dirname(markerPath)), basename(markerPath));
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(markerLeasePort(markerPath), '127.0.0.1', resolve);
  });
  let closing: Promise<void> | undefined;
  return Object.assign(
    () => (closing ??= new Promise<void>((resolve) => server.close(() => resolve()))),
    { markerPath },
  );
}
