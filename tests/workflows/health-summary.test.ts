/** 실제 워크플로의 요약 스크립트를 긴 오류 응답으로 검증합니다. */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/health-checks.yml', 'utf8');
const script = workflow.split("node <<'NODE'\n")[1].split('\n          NODE')[0];

describe('Health Checks 알림 요약', () => {
  it('긴 상세 오류보다 모든 실패·저하 ID를 앞에 두고 Actions에는 전체를 남긴다', () => {
    const checks = Array.from({ length: 12 }, (_, index) => ({
      id: `service-${index}`,
      status: index % 2 ? 'degraded' : 'fail',
      message: '긴 오류 '.repeat(500),
      sample: { first: `sample-${index}` },
    }));
    const files: Record<string, string> = {};
    const process = {
      env: {
        GITHUB_STEP_SUMMARY: 'step-summary',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_RUN_ID: '1',
      },
      exitCode: 0,
    };
    runInNewContext(script, {
      require: () => ({
        readFileSync: () => JSON.stringify({ status: 'fail', checks }),
        writeFileSync: (name: string, text: string) => {
          files[name] = text;
        },
        appendFileSync: (name: string, text: string) => {
          files[name] = (files[name] || '') + text;
        },
      }),
      process,
      console: { log: () => {} },
    });
    const notification = files['health-check-summary.txt'].slice(0, 3500);
    for (const check of checks) {
      expect(notification).toContain(check.id);
      expect(notification.indexOf(check.id)).toBeLessThan(notification.indexOf('긴 오류'));
      expect(files['step-summary']).toContain(
        `${check.id}:${check.status}:${check.message} sample=${check.sample.first}`,
      );
    }
    expect(process.exitCode).toBe(1);
  });
});
