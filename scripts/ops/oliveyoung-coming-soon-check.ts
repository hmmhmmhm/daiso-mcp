/**
 * 올리브영 coming soon(다음 오특 예고) 운영 확인
 *
 * 21시 이후 예고를 저장하고, 다음 날 자정 이후 실제 오특과 상품번호를 대조합니다.
 * 예고는 화면에 대략 한국 시간 21시부터 공개되므로 그 전 조회는 확인으로 쓰지 않습니다.
 */

export interface UpcomingDeal {
  goodsNo: string | null;
  name: string;
}

export interface TodayDealsBody {
  date: string;
  truncated: boolean;
  brandDeals: Array<{ goodsNo: string; name: string }>;
  todayDeals: Array<{ goodsNo: string; name: string }>;
  upcomingDeals: UpcomingDeal[] | null;
}

export interface UpcomingSnapshot {
  checkedAt: string;
  sourceDate: string;
  targetDate: string;
  upcomingDeals: UpcomingDeal[];
}

export const UPCOMING_PUBLIC_HOUR = 21;
const DAY_MS = 24 * 60 * 60 * 1000;
const kst = (now: number) => new Date(now + 9 * 60 * 60 * 1000);

export function kstDate(now: number, offsetDays = 0): string {
  return kst(now + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 21시 이후 오늘 날짜 응답의 예고만 다음 날 대조용으로 저장합니다. */
export function createUpcomingSnapshot(body: TodayDealsBody, now: number): UpcomingSnapshot {
  if (kst(now).getUTCHours() < UPCOMING_PUBLIC_HOUR) {
    throw new Error(`coming soon 공개 전입니다 (한국 시간 ${UPCOMING_PUBLIC_HOUR}시 이후 확인)`);
  }
  if (body.date !== kstDate(now)) {
    throw new Error(`오특 날짜가 오늘이 아닙니다: ${body.date}`);
  }
  if (!Array.isArray(body.upcomingDeals)) {
    throw new Error('coming soon 예고를 확인하지 못했습니다 (upcomingDeals=null)');
  }
  if (body.upcomingDeals.length === 0) {
    throw new Error('coming soon 예고 상품이 없습니다');
  }
  return {
    checkedAt: new Date(now).toISOString(),
    sourceDate: body.date,
    targetDate: kstDate(now, 1),
    upcomingDeals: body.upcomingDeals,
  };
}

export interface UpcomingComparison {
  ok: boolean;
  targetDate: string;
  previewCount: number;
  dealCount: number;
  matched: number;
  /** 예고했지만 실제 오특에 없는 상품 */
  notInDeals: UpcomingDeal[];
  /** 실제 오특에 있지만 예고에 없던 상품 */
  notInPreview: Array<{ goodsNo: string; name: string }>;
}

/** 전날 저장한 예고와 대상 날짜의 실제 오특(브랜드 + 오늘의 특가)을 상품번호로 대조합니다. */
export function compareUpcoming(
  snapshot: UpcomingSnapshot,
  body: TodayDealsBody,
): UpcomingComparison {
  if (body.date !== snapshot.targetDate) {
    throw new Error(`대조 날짜가 다릅니다: 예고 ${snapshot.targetDate}, 오특 ${body.date}`);
  }
  if (body.truncated) throw new Error('오특 목록이 잘려 전체 대조를 확인할 수 없습니다');
  const deals = [...body.brandDeals, ...body.todayDeals];
  const dealNos = new Set(deals.map((deal) => deal.goodsNo));
  const previewNos = new Set(snapshot.upcomingDeals.map((deal) => deal.goodsNo));
  const notInDeals = snapshot.upcomingDeals.filter(
    (deal) => !deal.goodsNo || !dealNos.has(deal.goodsNo),
  );
  const notInPreview = deals
    .filter((deal) => !previewNos.has(deal.goodsNo))
    .map(({ goodsNo, name }) => ({ goodsNo, name }));
  return {
    ok: notInDeals.length === 0 && notInPreview.length === 0,
    targetDate: snapshot.targetDate,
    previewCount: snapshot.upcomingDeals.length,
    dealCount: deals.length,
    matched: snapshot.upcomingDeals.length - notInDeals.length,
    notInDeals,
    notInPreview,
  };
}

/** /api/oliveyoung/today-deals 응답에서 본문을 꺼내고, 실패 응답은 오류로 바꿉니다. */
export async function fetchTodayDeals(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TodayDealsBody> {
  const response = await fetchImpl(new URL('/api/oliveyoung/today-deals', baseUrl));
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: TodayDealsBody;
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok || !payload?.success || !payload.data) {
    const reason = payload?.error ? `${payload.error.code}: ${payload.error.message}` : '본문 없음';
    throw new Error(`오특 조회 실패 (HTTP ${response.status}, ${reason})`);
  }
  return payload.data;
}
