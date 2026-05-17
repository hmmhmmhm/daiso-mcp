/**
 * MCP/API 공통 에러 진단 구조
 */

export interface StandardErrorDiagnostics {
  code: string;
  message: string;
  status?: number;
  retryable: boolean;
  service?: string;
  operation?: string;
  upstreamStatus?: number;
  hint: string;
}

const SERVICE_PREFIXES = [
  'daiso',
  'gs25',
  'seveneleven',
  'cu',
  'emart24',
  'lottemart',
  'megabox',
  'lottecinema',
  'cgv',
  'oliveyoung',
] as const;

function normalizeService(value: string): string {
  return value.toLowerCase().replace(/_/g, '');
}

function toOperation(parts: string[]): string | undefined {
  const filtered = parts.filter((part) => part.length > 0 && part !== 'FAILED');
  if (filtered.length === 0) {
    return undefined;
  }
  return filtered.map((part) => part.toLowerCase()).join('_');
}

function inferServiceAndOperation(code: string): Pick<StandardErrorDiagnostics, 'service' | 'operation'> {
  const parts = code.split('_').filter((part) => part.length > 0);
  const normalizedFirst = normalizeService(parts[0] || '');
  const service = SERVICE_PREFIXES.find((item) => normalizeService(item) === normalizedFirst);

  if (!service) {
    return { operation: toOperation(parts) };
  }

  return {
    service,
    operation: toOperation(parts.slice(1)),
  };
}

function isRetryable(code: string, status?: number): boolean {
  if (typeof status === 'number') {
    return status >= 500 || status === 408 || status === 429;
  }

  const normalized = code.toUpperCase();
  return normalized.includes('TIMEOUT') || normalized.includes('FAILED');
}

function buildHint(retryable: boolean): string {
  return retryable
    ? '일시적인 외부 서비스 오류일 수 있습니다. 잠시 후 다시 시도하세요.'
    : '입력값 또는 요청 조건을 확인하세요.';
}

export function toStandardErrorDiagnostics(
  code: string,
  message: string,
  options: {
    status?: number;
    operation?: string;
    service?: string;
    upstreamStatus?: number;
  } = {},
): StandardErrorDiagnostics {
  const inferred = inferServiceAndOperation(code);
  const retryable = isRetryable(code, options.status || options.upstreamStatus);

  return {
    code,
    message,
    status: options.status,
    retryable,
    service: options.service || inferred.service,
    operation: options.operation || inferred.operation,
    upstreamStatus: options.upstreamStatus,
    hint: buildHint(retryable),
  };
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}
