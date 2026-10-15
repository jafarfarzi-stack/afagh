import 'server-only';
import Redis from 'ioredis';

/**
 * پرچم «قفل بیکاری» (SessionLock) در سمت سرور.
 *
 * پیش از این قفل فقط state کلاینت بود: رفرش کافی بود تا کاربر دوباره داخل
 * کارتابل برگردد. حالا وقتی تایمر قفل فعال می‌شود client یک server action
 * می‌زند و پرچم برای کاربر ثبت می‌شود؛ layoutهای نقش هنگام رندر آن را
 * می‌خوانند و تا کاربر رمزش را درست وارد نکند (verifyOwnPasswordAction)
 * پرچم پاک نمی‌شود. رفرش/تب جدید پس از آن هم قفل می‌ماند.
 *
 * الگوی Redis مثل rateLimit: اگر در دسترس نباشد به حافظهٔ همین پروسه
 * سوییچ می‌شود (استقرار تک‌نمونه‌ای فعلی همین را کافی می‌کند) و کلید
 * قطع‌کنندهٔ ۳۰ثانیه‌ای مانع تلنبار شدن درخواست‌ها می‌شود.
 */

const g = globalThis as unknown as { __afaghSessLockRedis?: Redis };
const lockRedis: Redis = g.__afaghSessLockRedis ?? new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 2,
  retryStrategy: (t) => Math.min(t * 200, 2000),
  enableOfflineQueue: false,
  connectTimeout: 1000,
});
// شنوندهٔ خطا الزامی است: بدون آن، قطعی موقت Redis → Unhandled error → کرش Node
lockRedis.on('error', () => { /* خاموش — مسیر به fallback درون‌حافظه می‌رود */ });
if (process.env.NODE_ENV !== 'production') g.__afaghSessLockRedis = lockRedis;

const BREAKER_MS = 30_000;
let downUntil = 0;
lockRedis.on('ready', () => { downUntil = 0; });

const KEY = (id: number) => `sesslock:${id}`;
// پشتهٔ ایمنی: اگر پاک‌سازی هرگز به Redis نرسد، حداکثر ۲۴ ساعت بعد خودبه‌خود باز می‌شود.
const TTL_SEC = 24 * 3600;

/** userId → زمان انقضای قفل (mirror درون‌حافظه برای دوران قطعی Redis) */
const mem: Map<number, number> = new Map();
/** پاک‌سازی‌هایی که هنوز به Redis نرسیده‌اند — در هر فراخوانی بعدی دوباره تلاش می‌شود. */
const pendingClear = new Set<number>();

const sweep = () => {
  const now = Date.now();
  for (const [k, v] of mem) if (v <= now) mem.delete(k);
};

async function flushClears(): Promise<void> {
  if (!pendingClear.size) return;
  try {
    if (Date.now() < downUntil) throw new Error('redis-breaker-open');
    for (const id of [...pendingClear]) {
      await lockRedis.del(KEY(id));
      pendingClear.delete(id);
    }
  } catch { downUntil = Date.now() + BREAKER_MS; }
}

/** فعال شدن قفل بیکاری برای کاربر — با رفرش/تب جدید هم برداشته نمی‌شود. */
export async function setSessionLock(userId: number): Promise<void> {
  pendingClear.delete(userId);
  mem.set(userId, Date.now() + TTL_SEC * 1000);
  try {
    if (Date.now() < downUntil) throw new Error('redis-breaker-open');
    await lockRedis.set(KEY(userId), '1', 'EX', TTL_SEC);
  } catch { downUntil = Date.now() + BREAKER_MS; }
}

/** بازگشایی با رمز درست. */
export async function clearSessionLock(userId: number): Promise<void> {
  mem.delete(userId);
  pendingClear.add(userId);
  await flushClears();
}

/** آیا کاربر هم‌اکنون قفل است؟ (layoutها هنگام رندر می‌خوانند) */
export async function isSessionLocked(userId: number): Promise<boolean> {
  sweep();
  const m = mem.get(userId);
  if (m != null && m > Date.now()) return true;
  // پاک‌سازی عقب‌افتاده را اول انجام بده تا قفلِ پاک‌شده دوباره خوانده نشود
  await flushClears();
  try {
    if (Date.now() < downUntil) throw new Error('redis-breaker-open');
    return (await lockRedis.get(KEY(userId))) === '1';
  } catch { downUntil = Date.now() + BREAKER_MS; return false; }
}
