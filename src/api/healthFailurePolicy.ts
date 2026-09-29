/** 원본 CGV403으로 확인된 운영 제한만 별도로 분류합니다. */
export interface HealthFailureDetails {
  error?: { code?: string };
  diagnostics?: { upstreamStatus?: number };
}
export function isKnownCgvBlock(path: string, status: number, body: HealthFailureDetails): boolean {
  return (
    path.startsWith('/api/cgv/') &&
    status === 503 &&
    body.error?.code === 'CGV_UPSTREAM_UNAVAILABLE' &&
    body.diagnostics?.upstreamStatus === 403
  );
}
