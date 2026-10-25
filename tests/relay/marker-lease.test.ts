import { createConnection } from 'node:net';
import { expect, it } from 'vitest';
import { acquireMarkerLease, markerLeasePort } from '../../scripts/relay/marker-lease.js';
it('같은 마커의 동시 변경을 차단하고 OS 잠금 해제 뒤에만 새 시작을 허용한다', async () => {
  const path = '/private/tmp/oy-lease-test-' + process.pid;
  const release = await acquireMarkerLease(path);
  try {
    await expect(acquireMarkerLease(path)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(markerLeasePort(path), '127.0.0.1');
      socket.on('error', reject);
      socket.on('close', () => resolve());
    });
  } finally {
    await Promise.all([release(), release()]);
  }
  const next = await acquireMarkerLease(path);
  await next();
  expect(markerLeasePort(path)).toBe(markerLeasePort(path));
});

it('부모가 강제 종료되어도 파일 잠금 없이 OS가 포트를 해제한다', async () => {
  const { fork } = await import('node:child_process');
  const { writeFile, rm, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'oy-lease-process-'));
  const p = join(dir, 'child.mjs');
  const marker = join(dir, 'owner.json');
  const modulePath = new URL('file://' + resolve('scripts/relay/marker-lease.ts')).href;
  await writeFile(
    p,
    `import {acquireMarkerLease} from ${JSON.stringify(modulePath)};await acquireMarkerLease(${JSON.stringify(marker)});process.send('ready');`,
  );
  const child = fork(p, [], {
    execArgv: ['--import', resolve('node_modules/tsx/dist/loader.mjs')],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('message', () => resolve());
      child.once('error', reject);
      child.once('exit', () => reject(Error('child exited before ready')));
    });
    await expect(acquireMarkerLease(marker)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGKILL');
    await exited;
    const release = await acquireMarkerLease(marker);
    await release();
  } finally {
    child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
});

it('같은 디렉터리의 별칭 경로도 동일한 OS 잠금을 사용한다', async () => {
  const { mkdtemp, symlink, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'oy-lease-alias-'));
  const alias = dir + '-alias';
  try {
    await symlink(dir, alias);
    const release = await acquireMarkerLease(join(dir, 'owner.json'));
    try {
      await expect(acquireMarkerLease(join(alias, 'owner.json'))).rejects.toMatchObject({
        code: 'EADDRINUSE',
      });
    } finally {
      await release();
    }
  } finally {
    await rm(alias);
    await rm(dir, { recursive: true, force: true });
  }
});
