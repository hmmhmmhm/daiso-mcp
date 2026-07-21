export type OperationalAuthorization = 'authorized' | 'unauthorized' | 'not-configured';

export function readOperationalToken(headers: Headers): string {
  const authorization = headers.get('Authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }

  return (headers.get('x-health-check-key') || '').trim();
}

export function authorizeOperationalRequest(
  headers: Headers,
  configuredSecret: string | undefined,
): OperationalAuthorization {
  const secret = configuredSecret?.trim();
  if (!secret) {
    return 'not-configured';
  }

  return readOperationalToken(headers) === secret ? 'authorized' : 'unauthorized';
}
