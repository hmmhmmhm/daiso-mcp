import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
it.skipIf(process.platform !== 'darwin')(
  '새 브라우저 생성 이후의 유효한 준비 완료 기록이 있을 때만 숨김을 허용한다',
  () => {
    const source = readFileSync('scripts/relay/hide-oliveyoung.swift', 'utf8');
    expect(source).toContain('func readinessAllowsHiding');
    const start = source.indexOf('func readinessAllowsHiding');
    const end = source.indexOf('\nlet base =', start);
    const implementation = source.slice(start, end);
    const ready = { checkedAt: 1100, checks: { oliveyoung: { state: 'ready', failed: false } } };
    const cases = [
      ready,
      { ...ready, checkedAt: 999 },
      { ...ready, checkedAt: 1000.5 },
      { ...ready, checkedAt: 1010 },
      { ...ready, checkedAt: 1206 },
      { ...ready, checkedAt: '1100' },
      { ...ready, checks: { oliveyoung: { state: 'starting', failed: false } } },
      { ...ready, checks: { oliveyoung: { state: 'ready', failed: true } } },
      { ...ready, checks: {} },
      {},
    ];
    const directory = mkdtempSync(join(tmpdir(), 'hide-readiness-'));
    try {
      const script = join(directory, 'main.swift');
      const data = join(directory, 'cases.json');
      writeFileSync(data, JSON.stringify(cases));
      writeFileSync(
        script,
        'import Foundation\n' +
          implementation +
          '\nlet cases=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[1]))) as! [[String:Any]]\nfor row in cases { print(readinessAllowsHiding(row, launchedAt:1000, now:1200)) }\n',
      );
      const output = execFileSync('/usr/bin/swift', [script, data], { encoding: 'utf8' });
      expect(output.trim().split('\n')).toEqual(['true', ...Array(9).fill('false')]);
      writeFileSync(
        script,
        'import Foundation\n' +
          implementation +
          '\nprint(processLaunchTime("Mon Oct 26 00:53:22 2026", timeZone:TimeZone(secondsFromGMT:0)!) == 1792976002)\nprint(processLaunchTime("invalid") == nil)\n',
      );
      expect(execFileSync('/usr/bin/swift', [script], { encoding: 'utf8' }).trim()).toBe(
        'true\ntrue',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
