import 'server-only';
import { headers } from 'next/headers';
import Redis from 'ioredis';

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

/** IP کلاینت از هدرهای پروکسی (Caddy در مسیر production) — Next 15+: headers() پرامیس است */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = (h.get('x-forwarded-for') || '').split(',')[0]?.trim();
    return fwd || h.get('x-real-ip') || 'local';
  } catch {
    return 'local';
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

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
