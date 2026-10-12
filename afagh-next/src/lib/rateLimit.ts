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

/** IP کلاینت — فقط از هدر پروکسیِ مورداعتماد (Caddy در مسیر production).
 *
 *  هدر X-Forwarded-For را هر کلاینتی می‌تواند جعل کند؛ اعتماد به آن بدون
 *  پروکسیِ مورداعتماد یعنی مهاجم با هر درخواست یک IP تازه جا می‌زند و
 *  محدودیت per-IP را دور می‌زند. پس:
 *    • اگر TRUSTED_PROXY=1 (استقرار پشت Caddy/reverse-proxy) → XFF/X-Real-IP معتبرند.
 *    • در غیر این صورت XFF نادیده گرفته می‌شود (fail-closed: همه در سطل 'local').
 *  استقرارهای پشت Caddy باید TRUSTED_PROXY=1 را ست کنند. */
function proxyHeadersTrusted(): boolean {
  const v = (process.env.TRUSTED_PROXY || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'caddy';
}

// NOTE: when proxy headers are untrusted (TRUSTED_PROXY unset), every client
// shares the single 'local' bucket, so per-IP rate-limiting degrades to a
// global bucket. That fallback behavior is intentional (fail-closed), but a
// flood of 'local' hits can mean misconfiguration (proxy not marked trusted)
// or abuse. The sliding-60s counter below only logs a warning for
// observability — it never blocks or changes bucketing.
const LOCAL_BUCKET_WARN_THRESHOLD = 200;
let localBucketHits: number[] = [];
function noteLocalBucketFallback(): void {
  const now = Date.now();
  localBucketHits.push(now);
  const cutoff = now - 60_000;
  while (localBucketHits.length > 0 && localBucketHits[0]! < cutoff) localBucketHits.shift();
  if (localBucketHits.length > LOCAL_BUCKET_WARN_THRESHOLD) {
    console.warn('[ratelimit] rate-limit-fallback-abuse', { bucket: 'local', hitsIn60s: localBucketHits.length });
    localBucketHits = [];
  }
}

export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    if (proxyHeadersTrusted()) {
      const fwd = (h.get('x-forwarded-for') || '').split(',')[0]?.trim();
      return fwd || h.get('x-real-ip')?.trim() || 'local';
    }
    noteLocalBucketFallback();
    return 'local';
  } catch {
    noteLocalBucketFallback();
    return 'local';
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
