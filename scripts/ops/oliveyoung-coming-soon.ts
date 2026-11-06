/**
 * 올리브영 coming soon 운영 확인 실행 진입점
 *
 * npx tsx scripts/ops/oliveyoung-coming-soon.ts snapshot <file>  # 21시 이후 예고 저장
 * npx tsx scripts/ops/oliveyoung-coming-soon.ts compare <file>   # 자정 이후 실제 오특과 대조
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  compareUpcoming,
  createUpcomingSnapshot,
  fetchTodayDeals,
  type UpcomingSnapshot,
} from './oliveyoung-coming-soon-check.js';

const [mode, file] = process.argv.slice(2);
const baseUrl = process.env.OY_COMING_SOON_URL || 'https://mcp.aka.page';

if (mode === 'snapshot' && file) {
  const snapshot = createUpcomingSnapshot(await fetchTodayDeals(baseUrl), Date.now());
  writeFileSync(file, JSON.stringify(snapshot, null, 2));
  console.log(
    `status=ok sourceDate=${snapshot.sourceDate} targetDate=${snapshot.targetDate} upcoming=${snapshot.upcomingDeals.length}`,
  );
} else if (mode === 'compare' && file) {
  const snapshot = JSON.parse(readFileSync(file, 'utf8')) as UpcomingSnapshot;
  const result = compareUpcoming(snapshot, await fetchTodayDeals(baseUrl));
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `status=${result.ok ? 'ok' : 'mismatch'} targetDate=${result.targetDate} matched=${result.matched}/${result.previewCount} deals=${result.dealCount}`,
  );
  if (!result.ok) process.exit(1);
} else {
  console.error('usage: oliveyoung-coming-soon.ts <snapshot|compare> <file>');
  process.exit(2);
}
