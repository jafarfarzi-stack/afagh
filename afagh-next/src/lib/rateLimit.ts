import 'server-only';
import { headers } from 'next/headers';
import { createHmac } from 'node:crypto';
import Redis from 'ioredis';
import { normalizeClientIp } from './proxy-trust';
import { requestClientIp } from './request-context';

/**
 * ══════════════════════════════════════════════════════════════════
 *  Rate-Limit سراسری (M-1)
 *
 *  پیش از این هیچ محدودیت تلاشی روی مسیرهای پرخطر وجود نداشت:
 *    • login()      → brute-force رمز فقط با هزینهٔ scrypt (~۴۳ms) مهار می‌شد
 *    • id/actions   → شمارش کدهای دانشجویی و کشف نام برای هر کسی ممکن بود
 *    • verify-certificate → استعلام عمومی بدون سقف
 *
 *  پیاده‌سازی: شمارندهٔ اتمیک در Redis (INCR+EXPIRE). اگر Redis در دسترس
 *  نباشد (مثلاً توسعهٔ محلی)، fallback درون‌حافظهٔ کوچک استفاده می‌شود تا
 *  هیچ‌وقت مسیر پرخطر «بدون محدودیت» نماند — حتی به قیمت از دست رفتن
 *  شمارش پس از ری‌استارت (که برای اهداف rate-limit قابل قبول است).
 * ══════════════════════════════════════════════════════════════════
 */

export const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const g = globalThis as unknown as { __afaghRlRedis?: Redis };
const rlRedis: Redis = g.__afaghRlRedis ?? new Redis(REDIS_URL, {
  maxRetriesPerRequest: 2,
  retryStrategy: (t) => Math.min(t * 200, 2000),
  lazyConnect: false,
  // بدون این، دستورها هنگام قطعی در صف می‌مانند تا مهلت تمام شود؛ با آن،
  // بی‌درنگ خطا می‌دهند و ما به شمارندهٔ حافظه‌ای سوییچ می‌کنیم.
  enableOfflineQueue: false,
  connectTimeout: 1000,
});
// شنوندهٔ خطا الزامی است: بدون آن، قطعی موقت Redis → Unhandled error → کرش Node (بازبینی مهندسی)
rlRedis.on('error', () => { /* خاموش — مسیر rateLimit به fallback درون‌حافظه می‌رود */ });
if (process.env.NODE_ENV !== 'production') g.__afaghRlRedis = rlRedis;

/**
 * کلید قطع‌کننده (circuit breaker).
 *
 * ⚠️ چرا لازم شد: با خاموش بودن Redis، هر فراخوانِ rateLimit پیش از رسیدن به
 * fallback حدود ۶ ثانیه صرف تلاش مجدد می‌کرد. چون *ورود به سامانه* هم
 * rate-limit دارد، قطعی Redis یعنی «هر تلاش ورود ۶ ثانیه» و در ساعت شلوغی،
 * تلنبار شدن اتصال‌ها و از کار افتادن عملی سایت. حالا پس از نخستین شکست،
 * تا ۳۰ ثانیه اصلاً سراغ Redis نمی‌رویم.
 */
const BREAKER_MS = 30_000;
let redisDownUntil = 0;
rlRedis.on('ready', () => { redisDownUntil = 0; });

// ── fallback درون‌حافظه (فقط وقتی Redis در دسترس نیست) ──
type MemCount = { count: number; resetAt: number };
const mem: Map<string, MemCount> = new Map();
const memSweep = () => {
  const now = Date.now();
  for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
};

/**
 * ══════════════════════════════════════════════════════════════════
 *  هویت کلاینت برای محدودسازی نرخ — مدل اعتماد (سه لایه)
 *
 *  هیچ هدر ورودی به‌تنهایی قابل اعتماد نیست؛ `X-Forwarded-For` را خودِ کلاینت
 *  هم می‌تواند بفرستد. پس به ترتیب:
 *
 *  ۱) «منبع سخت‌شده» = requestClientIp(): پروکسیِ مورداعتماد هویت واقعی را در
 *     x-afagh-client-ip می‌نویسد و با توکنِ مشترک (x-afagh-proxy-token، مقایسهٔ
 *     زمان‌ثابت) آن را تأیید می‌کند. این تنها مسیری است که به هدرِ نوشته‌شده
 *     توسط خودِ پروکسی تکیه می‌کند (AFAGH_TRUST_PROXY + AFAGH_PROXY_SECRET).
 *
 *  ۲) سازگاری با استقرارهای قدیمی (TRUSTED_PROXY/AFAGH_TRUST_PROXY): فقط
 *     «راست‌ترین» hop از XFF خوانده می‌شود. هر پروکسی آدرسِ همسایهٔ قبلی را به
 *     *انتهای* لیست اضافه می‌کند؛ پس راست‌ترین مقدار همان چیزی است که
 *     نزدیک‌ترین پروکسیِ ما نوشته، و چپ‌ترین مقدار کاملاً در اختیار کلاینت است.
 *     (باگ قبلی: خواندن چپ‌ترین → مهاجم با هر درخواست یک سطل تازه می‌گرفت.)
 *     ⚠ اگر چند پروکسیِ مورداعتماد پشت‌سرهم باشند، راست‌ترین hop آدرسِ پروکسیِ
 *     داخلی است؛ یعنی کلاینت‌های پشت آن پروکسی یک سطل مشترک می‌گیرند. این
 *     انتخابِ محافظه‌کارانه است (هرگز هدرِ قابل‌جعل را ترجیح نمی‌دهیم).
 *
 *  ۳) بدون هیچ پیکربندی اعتماد: به‌جای یک سطل مشترک ('local'/'unknown') که با
 *     یک سیلِ ساده کل سایت را قفل می‌کرد، یک «اثرانگشت» HMAC‌شده می‌سازیم از
 *     راست‌ترین hop (در صورت وجود) + کوکی نشست + مشخصاتِ پایدار مرورگر.
 *     نتیجه: کلاینت‌ها سطل‌های جدا دارند و کلید را نمی‌توان با یک هدرِ دلبخواه
 *     به سطلِ قربانی هدایت کرد (کلید مشتق‌شده است، نه ورودی خام).
 *     ⚠ هزینه/محدودیت این حالت: اگر اپ *مستقیماً* روی اینترنت expose شود
 *     (خلافِ پیش‌فرضِ loopback)، راست‌ترین hop هم قابل جعل است و فقط مؤلفه‌های
 *     سمتِ مرورگر می‌مانند؛ پس محدودیت per-account (مثل login بر اساس نام
 *     کاربری) باید همیشه لایهٔ دوم بماند. برای تفکیک دقیق per-IP باید لایهٔ ۱
 *     فعال شود: AFAGH_TRUST_PROXY=true و AFAGH_PROXY_SECRET (≥۳۲ کاراکتر) و
 *     تزریق هدرهای x-afagh-* توسط پروکسی.
 * ══════════════════════════════════════════════════════════════════
 */

/** فلگ اعتماد به پروکسی؛ هر دو نام قدیمی و جدید پشتیبانی می‌شوند. */
function legacyProxyTrustEnabled(): boolean {
  return [process.env.TRUSTED_PROXY, process.env.AFAGH_TRUST_PROXY]
    .map((v) => (v ?? '').trim().toLowerCase())
    .some((v) => v === '1' || v === 'true' || v === 'yes' || v === 'caddy');
}

/**
 * فقط آخرین (راست‌ترین) عنصر XFF — نه چپ‌ترین.
 *
 * عناصر میانی/چپ در اختیار کلاینت‌اند و حتی اگر «معتبر» به‌نظر برسند نباید
 * استفاده شوند. اگر آخرین عنصر IP معتبر نباشد (مثلاً 'unknown' یا IP:port)،
 * هیچ hop ای برنمی‌گردانیم و به لایهٔ بعد می‌رویم؛ اسکن کردنِ عقب‌گرد برای
 * یافتنِ اولین مقدار معتبر همان آسیب‌پذیری جعل را برمی‌گرداند.
 */
function rightmostForwardedIp(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(',');
  return normalizeClientIp(parts[parts.length - 1] ?? '');
}

/** مقدار زبان اصلی از Accept-Language (بدون پارامترهای q). */
function primaryLanguage(value: string | null): string {
  return (value ?? '').split(',')[0]?.trim().slice(0, 32) ?? '';
}

/**
 * استخراج کوکی نشست از هدر Cookie — عمداً بدون import از auth.ts تا چرخهٔ
 * ماژول (auth → rateLimit → auth) نسازیم. نام کوکی در auth.ts برابر
 * SESSION_COOKIE = 'token' است.
 */
function sessionTokenFromCookie(value: string | null): string {
  if (!value) return '';
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === 'token') return part.slice(eq + 1).trim().slice(0, 256);
  }
  return '';
}

/**
 * کلید جایگزین (fallback) وقتی هیچ پروکسیِ تأییدشده‌ای نداریم.
 *
 * HMAC فقط برای «حوزه‌بندی و یک‌طرفه‌سازی» است تا توکن خامِ نشست در کلید Redis
 * نیفتد؛ رازِ امنیتی نیست. ورودی‌ها به‌گونه‌ای ترکیب می‌شوند که برای ساختنِ
 * سطلِ تازه، کلاینت باید چند مقدارِ مستقل (hop نوشته‌شده توسط پروکسی، نشست،
 * User-Agent، زبان) را هم‌زمان عوض کند — نه فقط یک هدر.
 */
const FALLBACK_HMAC_KEY = 'afagh:ratelimit:fallback:v1';
function fallbackClientKey(h: { get(name: string): string | null }): string {
  const material = [
    rightmostForwardedIp(h.get('x-forwarded-for')) ?? 'no-hop',
    sessionTokenFromCookie(h.get('cookie')),
    (h.get('user-agent') ?? '').slice(0, 256),
    primaryLanguage(h.get('accept-language')),
  ].join('\u0000');
  const digest = createHmac('sha256', FALLBACK_HMAC_KEY).update(material).digest('hex').slice(0, 32);
  return `fp:${digest}`;
}

/** هشدارِ حداکثر یک‌بار در دقیقه برای دیدنِ پیکربندیِ ناقص (نه برای بلاک کردن). */
let lastFallbackWarnAt = 0;
function noteUntrustedFallback(): void {
  const now = Date.now();
  if (now - lastFallbackWarnAt < 60_000) return;
  lastFallbackWarnAt = now;
  console.warn(
    '[ratelimit] proxy-trust-missing — از کلید اثرانگشتِ جایگزین استفاده شد؛ ' +
    'برای محدودسازی دقیق per-IP، AFAGH_TRUST_PROXY/AFAGH_PROXY_SECRET را تنظیم و هدرهای x-afagh-* را تزریق کنید.',
  );
}

/**
 * IP/هویت کلاینت برای کلید rate-limit.
 *
 * امضای تابع (`Promise<string>`) برای سازگاری با همهٔ فراخوان‌های موجود حفظ شده
 * است، اما خروجی ممکن است IPِ تأییدشده، IPِ راست‌ترین hop، یا کلیدِ
 * `fp:<hash>` باشد — هرگز یک ثابتِ مشترکِ سراسری نیست (به‌جز خارج از بافت
 * درخواست که کاربر واقعی وجود ندارد).
 */
export async function clientIp(): Promise<string> {
  // لایهٔ ۱: هویتی که پروکسیِ مورداعتماد با توکنِ مشترک تأیید کرده است.
  try {
    const trusted = await requestClientIp();
    if (trusted) return trusted;
  } catch { /* ادامه به لایه‌های بعدی */ }

  try {
    const h = await headers();
    // لایهٔ ۲: استقرارهای قدیمی — فقط راست‌ترین hop، هرگز چپ‌ترین.
    if (legacyProxyTrustEnabled()) {
      const hop = rightmostForwardedIp(h.get('x-forwarded-for'));
      if (hop) return hop;
      const realIp = normalizeClientIp(h.get('x-real-ip'));
      if (realIp) return realIp;
    }
    // لایهٔ ۳: بدون پیکربندی — اثرانگشتِ یکتا به‌جای سطل مشترک.
    noteUntrustedFallback();
    return fallbackClientKey(h);
  } catch {
    // خارج از بافت درخواست (کران/اسکریپت/تست): هویت کاربری وجود ندارد.
    // تنها حالتی که یک کلید ثابت برمی‌گردانیم؛ چون درخواستِ بیرونی نیست،
    // سطل مشترک نمی‌تواند به DoS عمومی تبدیل شود.
    return 'process';
  }
}

/** شمارش فعلی یک کلید (برای تأخیر تصاعدی) — بدون افزایش شمارنده. */
export async function getRateLimitCount(key: string): Promise<number> {
  const rkey = `rl:${key}`;
  try {
    if (Date.now() < redisDownUntil) throw new Error('redis-breaker-open');
    return Number((await rlRedis.get(rkey)) ?? 0);
  } catch {
    redisDownUntil = Date.now() + BREAKER_MS;
    const rec = mem.get(rkey);
    return rec && rec.resetAt > Date.now() ? rec.count : 0;
  }
}

/** تأخیر تصاعدی (ms) بر اساس تعداد خطا — جایگزین قفل سخت: 200ms، 400ms، … سقف 10 ثانیه. */
export function progressiveDelayMs(failCount: number): number {
  const n = Math.max(0, Math.floor(failCount));
  return Math.min(200 * (n + 1), 10_000);
}

/** خواب تصاعدی پس از خطا — فراخواننده باید await کند. */
export function progressiveDelay(failCount: number): Promise<void> {
  return new Promise((r) => setTimeout(r, progressiveDelayMs(failCount)));
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * بررسی بدون شمارش — برای گیت‌هایی که فقط «خطاها» باید بشمارند (مثل ورود:
 * موفقیت نباید سهمیه بسوزاند و قفل یک حساب نباید به حساب دیگر سرایت کند).
 */
export async function peekRateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const rkey = `rl:${key}`;
  try {
    if (Date.now() < redisDownUntil) throw new Error('redis-breaker-open');
    const n = Number((await rlRedis.get(rkey)) ?? 0);
    if (n >= limit) {
      const ttl = await rlRedis.ttl(rkey);
      return { ok: false, retryAfterSec: Math.max(1, ttl < 0 ? windowSec : ttl) };
    }
    return { ok: true };
  } catch {
    redisDownUntil = Date.now() + BREAKER_MS;
    const now = Date.now();
    const rec = mem.get(rkey);
    if (rec && rec.resetAt > now && rec.count >= limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((rec.resetAt - now) / 1000)) };
    }
    return { ok: true };
  }
}

/** فقط شمارش (بدون بررسی) — همراه peekRateLimit برای «شمارشِ فقط خطا». */
export async function hitRateLimit(key: string, windowSec: number): Promise<void> {
  const rkey = `rl:${key}`;
  try {
    if (Date.now() < redisDownUntil) throw new Error('redis-breaker-open');
    const n = await rlRedis.incr(rkey);
    if (n === 1) await rlRedis.expire(rkey, windowSec);
  } catch {
    redisDownUntil = Date.now() + BREAKER_MS;
    const now = Date.now();
    if (mem.size > 10000) memSweep();
    const rec = mem.get(rkey);
    if (!rec || rec.resetAt <= now) mem.set(rkey, { count: 1, resetAt: now + windowSec * 1000 });
    else rec.count += 1;
  }
}

/** آزادسازی یک رزرو قبلی (برگرداندن یک شمارش) — برای موفقیت پس از rateLimit. */
export async function releaseRateLimit(key: string): Promise<void> {
  const rkey = `rl:${key}`;
  try {
    if (Date.now() < redisDownUntil) throw new Error('redis-breaker-open');
    const n = await rlRedis.decr(rkey);
    if (n <= 0) await rlRedis.del(rkey);
  } catch {
    redisDownUntil = Date.now() + BREAKER_MS;
    const rec = mem.get(rkey);
    if (rec && rec.resetAt > Date.now()) {
      rec.count -= 1;
      if (rec.count <= 0) mem.delete(rkey);
    }
  }
}

/**
 * مجاز بودن درخواست — بعد از سررسید محدودیت، خودکار آزاد می‌شود.
 * @param key       کلید (مثلاً `login:1.2.3.4`)
 * @param limit     حداکثر تلاش در پنجره
 * @param windowSec طول پنجره به ثانیه
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const rkey = `rl:${key}`;
  try {
    if (Date.now() < redisDownUntil) throw new Error('redis-breaker-open');
    const n = await rlRedis.incr(rkey);
    if (n === 1) await rlRedis.expire(rkey, windowSec);
    if (n > limit) {
      const ttl = await rlRedis.ttl(rkey);
      return { ok: false, retryAfterSec: Math.max(1, ttl < 0 ? windowSec : ttl) };
    }
    return { ok: true };
  } catch {
    // Redis در دسترس نیست → fallback درون‌حافظه (و باز نگه‌داشتن کلید قطع‌کننده)
    redisDownUntil = Date.now() + BREAKER_MS;
    const now = Date.now();
    if (mem.size > 10000) memSweep();
    const rec = mem.get(rkey);
    if (!rec || rec.resetAt <= now) {
      mem.set(rkey, { count: 1, resetAt: now + windowSec * 1000 });
      return { ok: true };
    }
    rec.count += 1;
    if (rec.count > limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((rec.resetAt - now) / 1000)) };
    }
    return { ok: true };
  }
}

/** گارد آمادهٔ استفاده در Server Action / Route — پیام فارسی استاندارد */
export async function guardedRateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await rateLimit(key, limit, windowSec);
  if (r.ok) return { ok: true };
  return {
    ok: false,
    error: `تعداد درخواست‌ها بیش از حد مجاز است. چند دقیقهٔ دیگر دوباره تلاش کنید (${r.retryAfterSec} ثانیه).`,
  };
}
