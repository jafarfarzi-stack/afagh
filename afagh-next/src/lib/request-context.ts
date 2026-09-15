import 'server-only';
import { headers } from 'next/headers';
import { trustedClientIp, UNKNOWN_CLIENT_IP } from './proxy-trust';

export async function requestClientIp(): Promise<string | null> {
  try {
    return trustedClientIp(await headers(), {
      enabled: process.env.AFAGH_TRUST_PROXY === 'true',
      secret: process.env.AFAGH_PROXY_SECRET ?? '',
    });
  } catch { return null; }
}

/** Untrusted requests share a stable limiter bucket; never use spoofable data. */
export async function clientIp(): Promise<string> {
  return (await requestClientIp()) ?? UNKNOWN_CLIENT_IP;
}
