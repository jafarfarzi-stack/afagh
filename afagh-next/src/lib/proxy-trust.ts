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

/**
 * ────────────────────────────────────────────────────────────────────────
 *  ماتریس تصمیم انتقال کوکی نشست (منبع واحد حقیقت)
 * ────────────────────────────────────────────────────────────────────────
 *
 *  تصمیم فقط از ENV گرفته می‌شود، هرگز از هدرهای درخواست (Host /
 *  X-Forwarded-Proto / X-Forwarded-For / ...). دلیل: اگر هدر مبنا باشد، یک
 *  پروکسی نادرست یا مهاجم می‌تواند کوکی را به کانال ناامن «تنزل» بدهد.
 *
 *  ۱) Secure:
 *     • NODE_ENV=production  → همیشه true. مقدار AFAGH_COOKIE_SECURE=false
 *       در production نادیده گرفته می‌شود (یک‌بار هشدار لاگ می‌شود) تا
 *       کوکی نشست هرگز روی HTTP تولید ارسال نشود.
 *     • غیر production:
 *         AFAGH_COOKIE_SECURE=true   → true
 *         AFAGH_COOKIE_SECURE=false  → false  (فقط برای HTTP محلی)
 *         auto / خالی / نامعتبر      → اگر AFAGH_PUBLIC_BASE_URL با https://
 *                                      باشد true، وگرنه false.
 *       URL نامعتبر/خالی در production به «امن» (Secure=true) میل می‌کند،
 *       نه به «ناامن».
 *
 *  ۲) SameSite:
 *         AFAGH_COOKIE_SAMESITE=none   → none  (فقط اگر Secure=true)
 *         AFAGH_COOKIE_SAMESITE=strict → strict
 *         lax / auto / خالی / نامعتبر → lax  (پیش‌فرض امن)
 *
 *  ۳) قاعدهٔ اجباری «none + ناامن ممنوع»:
 *     مرورگرها SameSite=None را بدون Secure رد می‌کنند؛ اگر جایی پذیرفته
 *     شود، کوکی روی HTTP قابل شنود/سرقت است. بنابراین ترکیب
 *     SameSite=None با Secure=false «رد» و به Lax برگردانده می‌شود
 *     (fail-safe) و هشدار لاگ می‌گیرد. برای SameSite=None باید
 *     AFAGH_COOKIE_SECURE=true و HTTPS واقعی داشته باشید.
 *
 *  ۴) هزینهٔ iframe (opt-in صریح):
 *     SameSite=None فقط برای جاسازی cross-site لازم است و به‌معنی
 *     «مرورگر کوکی نشست را با درخواست‌های سایت دیگر هم می‌فرستد». پس
 *     امنیت تنها با بررسی Origin/Referer (assertCsrf در Route Handlerها و
 *     assertServerActionOrigin در Server Actionها) حفظ می‌شود. بدون این
 *     لایه‌ها SameSite=None را فعال نکنید؛ Lax پیش‌فرضِ امن است.
 * ────────────────────────────────────────────────────────────────────────
 */

/** هشدارها فقط یک‌بار چاپ می‌شوند تا لاگ در هر درخواست پر نشود. */
let warnedInsecureNone = false;
let warnedCrossSiteNone = false;
let warnedProductionSecureOverride = false;

export function sessionTransport(env: Record<string, string | undefined>) {
  let https = env.NODE_ENV === 'production';
  try {
    const url = new URL(env.AFAGH_PUBLIC_BASE_URL ?? '');
    if (url.protocol === 'https:' || url.protocol === 'http:') https = url.protocol === 'https:';
  } catch { /* پیش‌فرض امن در production */ }

  const production = env.NODE_ENV === 'production';
  const secureMode = (env.AFAGH_COOKIE_SECURE ?? 'auto').toLowerCase();
  // در production هیچ ENVای نمی‌تواند Secure را خاموش کند (fail-closed).
  const secure = production ? true : secureMode === 'true' ? true : secureMode === 'false' ? false : https;

  if (production && secureMode === 'false' && !warnedProductionSecureOverride) {
    warnedProductionSecureOverride = true;
    console.warn('⚠ [cookie] AFAGH_COOKIE_SECURE=false در production نادیده گرفته شد؛ Secure اجباری است.');
  }

  const mode = (env.AFAGH_COOKIE_SAMESITE ?? 'auto').toLowerCase();
  let sameSite: 'lax' | 'none' | 'strict' = mode === 'none' ? 'none' : mode === 'strict' ? 'strict' : 'lax';

  // «none + ناامن» را نمی‌پذیریم: مرورگر رد می‌کند و اگر نپذیرد، کوکی لو می‌رود.
  if (sameSite === 'none' && !secure) {
    if (!warnedInsecureNone) {
      warnedInsecureNone = true;
      console.warn('⛔ [cookie] AFAGH_COOKIE_SAMESITE=none بدون Secure رد شد؛ به Lax برگشت. برای iframe باید HTTPS و AFAGH_COOKIE_SECURE=true باشد.');
    }
    sameSite = 'lax';
  }

  // SameSite=None یک تصمیم صریح امنیتی است، نه پیش‌فرض؛ یک‌بار یادآوری می‌کنیم.
  if (sameSite === 'none' && !warnedCrossSiteNone) {
    warnedCrossSiteNone = true;
    console.warn('⚠ [cookie] SameSite=None فعال است (opt-in برای جاسازی cross-site)؛ محافظت CSRF از طریق assertCsrf / assertServerActionOrigin الزامی است.');
  }

  return { secure, sameSite };
}
