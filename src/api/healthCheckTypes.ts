/**
 * 헬스 체크 공통 타입
 */

export type HealthCheckStatus = 'ok' | 'degraded' | 'fail' | 'skipped';
export type HealthCheckMode = 'quick' | 'deep' | 'full';

export interface HealthCheckDefinition {
  id: string;
  service: string;
  target: string;
  mode: 'quick' | 'deep';
  path: string;
  kind?: 'api' | 'cli-contract';
  collectionKey?:
    | 'products'
    | 'stores'
    | 'theaters'
    | 'movies'
    | 'showtimes'
    | 'inventoryProducts'
    | 'inventoryItems';
  requiredFields?: string[];
  timeoutMs?: number;
  degradedFailurePatterns?: string[];
}

export interface HealthCheckResult {
  id: string;
  service: string;
  target: string;
  status: HealthCheckStatus;
  durationMs: number;
  message: string;
  httpStatus?: number;
  sample?: {
    first?: string;
  };
}

export interface HealthCheckSummary {
  status: HealthCheckStatus;
  checkedAt: string;
  durationMs: number;
  cached: boolean;
  filters: {
    service: string | null;
    check: string | null;
    mode: HealthCheckMode;
  };
  checks: HealthCheckResult[];
}
