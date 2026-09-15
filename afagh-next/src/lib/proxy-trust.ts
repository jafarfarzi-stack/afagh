import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

export type HeaderReader = { get(name: string): string | null };
export type ProxyConfig = { enabled: boolean; secret: string };
export const UNKNOWN_CLIENT_IP = 'unknown';

/** Accept exactly one canonical IP, not a forwarded list or an IP:port pair. */
export function normalizeClientIp(input: string | null): string | null {
  if (!input || input.length > 64 || input.includes('%')) return null;
  const ip = input.trim();
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return null;
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  // Collapse IPv4-mapped IPv6 so one client cannot use two limiter identities.
  const mapped = normalized.match(/^::ffff:([\da-f]+):([\da-f]+)$/);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >>> 8, high & 255, low >>> 8, low & 255].join('.');
  }
  return normalized;
}

/** Next headers do not expose the transport peer address. Trust therefore
 * requires an isolated upstream AND a proxy-overwritten authenticated header.
 * Never infer trust from Host, X-Forwarded-For, or a claimed proxy IP. */
export function trustedClientIp(headers: HeaderReader, config: ProxyConfig): string | null {
  if (!config.enabled || config.secret.length < 32) return null;
  const presented = headers.get('x-afagh-proxy-token') ?? '';
  const known = Buffer.from(config.secret);
  const candidate = Buffer.from(presented);
  if (candidate.length !== known.length || !timingSafeEqual(candidate, known)) return null;
  return normalizeClientIp(headers.get('x-afagh-client-ip'));
}

/** Cookie transport policy comes from deployment configuration, never headers.
 * Preserve explicit local HTTP support. Missing/invalid production URL defaults
 * to Secure rather than allowing a forged header to downgrade the cookie. */
export function sessionTransport(env: Record<string, string | undefined>) {
  let https = env.NODE_ENV === 'production';
  try {
    const url = new URL(env.AFAGH_PUBLIC_BASE_URL ?? '');
    if (url.protocol === 'https:' || url.protocol === 'http:') https = url.protocol === 'https:';
  } catch { /* secure production default */ }
  const secureMode = (env.AFAGH_COOKIE_SECURE ?? 'auto').toLowerCase();
  const secure = secureMode === 'true' ? true : secureMode === 'false' ? false : https;
  const mode = (env.AFAGH_COOKIE_SAMESITE ?? 'auto').toLowerCase();
  let sameSite: 'lax' | 'none' | 'strict' = mode === 'none' ? 'none' : mode === 'strict' ? 'strict' : mode === 'lax' ? 'lax' : https ? 'none' : 'lax';
  if (sameSite === 'none' && !secure) sameSite = 'lax';
  return { secure, sameSite };
}
