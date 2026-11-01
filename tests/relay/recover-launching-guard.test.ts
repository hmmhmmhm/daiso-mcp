import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { recoverAbandonedGuard } from '../../scripts/relay/recover-abandoned-guard.js';

it('시작 실패 마커는 감시자와 태그된 프로세스의 소멸을 두 번 확인한 뒤 보존한다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'launch-recovery-'));
  const marker = join(dir, 'owner.json');
  try {
    await writeFile(marker, JSON.stringify({guardPid:12345,state:'launching',crashDir:marker+'.12345678-1234-1234-1234-123456789abc.crashpad'}), {mode:0o600});
    // 원래 프로세스와 실행 환경 태그가 모두 없을 때만 다음 실행을 허용한다.
    const snapshot = vi.fn().mockResolvedValue([]);
    expect(await recoverAbandonedGuard(marker, Date.now()+5000, snapshot, async () => false)).toBe(true);
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect((await readdir(dir)).filter(x=>x.startsWith('owner.json.exited-'))).toHaveLength(1);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
