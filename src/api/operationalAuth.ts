export type OperationalAuthorization = 'authorized' | 'unauthorized' | 'not-configured';

const textEncoder = new TextEncoder();

export function readOperationalToken(headers: Headers): string {
  const authorization = headers.get('Authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }

  return (headers.get('x-health-check-key') || '').trim();
}

async function digestToken(token: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', textEncoder.encode(token));
}

async function compareDigests(left: ArrayBuffer, right: ArrayBuffer): Promise<boolean> {
  const timingSafeEqual = crypto.subtle.timingSafeEqual;
  if (typeof timingSafeEqual === 'function') {
    return timingSafeEqual.call(crypto.subtle, left, right);
  }

  // Node Web Crypto에는 Workers 확장 메서드가 없으므로 네이티브 HMAC 검증으로 비교한다.
  const key = await crypto.subtle.importKey(
    'raw',
    right,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, right);
  return crypto.subtle.verify('HMAC', key, signature, left);
}

export async function authorizeOperationalRequest(
  headers: Headers,
  configuredSecret: string | undefined,
): Promise<OperationalAuthorization> {
  const secret = configuredSecret?.trim();
  if (!secret) {
    return 'not-configured';
  }

  const [requestDigest, secretDigest] = await Promise.all([
    digestToken(readOperationalToken(headers)),
    digestToken(secret),
  ]);
  return (await compareDigests(requestDigest, secretDigest)) ? 'authorized' : 'unauthorized';
}
