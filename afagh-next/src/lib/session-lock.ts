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
  // بازگشایی = فعالیت: ساعت بیکاری از این لحظه از نو شمرده شود، وگرنه بلافاصله دوباره قفل می‌شد
  await touchActivity(userId);
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

/* ------------------------------------------------------------------------- *
 * قفل بیکاری سرور-محور (بر پایهٔ «زمان آخرین فعالیت»)
 *
 * چرا: پیش‌تر قفل فقط با server action کلاینت (lockNowAction) در سرور ثبت
 * می‌شد؛ اگر آن action رد می‌شد (ناهم‌خوانی Origin/Host پشت پروکسی،
 * آی‌فریم، قطع لحظه‌ای شبکه) پرچم ثبت نمی‌شد و رفرش کاربر را بی‌قفل
 * برمی‌گرداند. حالا «آخرین فعالیت» در سرور نگه داشته می‌شود و قفل از روی
 * آن محاسبه می‌گردد؛ پس رفرش/تب جدید هم قفل را نشان می‌دهد و کاربرِ در حال
 * کار هرگز بی‌دلیل بیرون نمی‌افتد.
 * ------------------------------------------------------------------------- */

const SEEN_KEY = (id: number) => `sessseen:${id}`;
/** TTL کلید فعالیت — بیشتر از هر سقف معقولِ قفل (۲۴ ساعت). */
const SEEN_TTL_SEC = 24 * 3600;

/** userId → آخرین فعالیت (mirror درون‌حافظه برای دوران قطعی Redis) */
const seenMem: Map<number, number> = new Map();
/** نوشتن‌های عقب‌افتادهٔ فعالیت که هنوز به Redis نرسیده‌اند. */
const pendingSeen: Map<number, number> = new Map();

async function flushSeen(): Promise<void> {
  if (!pendingSeen.size) return;
  try {
    if (Date.now() < downUntil) throw new Error('redis-breaker-open');
    for (const [id, at] of [...pendingSeen]) {
      await lockRedis.set(SEEN_KEY(id), String(at), 'EX', SEEN_TTL_SEC);
      if (pendingSeen.get(id) === at) pendingSeen.delete(id);
    }
  } catch { downUntil = Date.now() + BREAKER_MS; }
}

/** ثبت یک «فعالیت» کاربر (بازدید صفحه، حرکت ماوس، تایپ، لمس). */
export async function touchActivity(userId: number, at: number = Date.now()): Promise<void> {
  const cutoff = at - SEEN_TTL_SEC * 1000;
  for (const [k, v] of seenMem) if (v < cutoff) seenMem.delete(k);
  seenMem.set(userId, at);
  pendingSeen.set(userId, at);
  await flushSeen();
}

/** زمان آخرین فعالیت — null یعنی هنوز برای این کاربر ثبت نشده. */
export async function lastActivityAt(userId: number): Promise<number | null> {
  const m = seenMem.get(userId);
  if (m != null) return m;
  await flushSeen();
  try {
    if (Date.now() < downUntil) throw new Error('redis-breaker-open');
    const v = await lockRedis.get(SEEN_KEY(userId));
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch { downUntil = Date.now() + BREAKER_MS; return null; }
}

/** آیا از آخرین فعالیت بیش از timeoutMin دقیقه گذشته؟ (بدون به‌روزرسانی زمان) */
export async function isIdle(userId: number, timeoutMin: number): Promise<boolean> {
  if (!(timeoutMin > 0)) return false;
  const at = await lastActivityAt(userId);
  if (at === null) return false; // نخستین مشاهده — مبنایی برای بیکاری نیست
  return Date.now() - at > timeoutMin * 60_000;
}

/**
 * ارزیابی قفل بیکاری هنگام رندر layout (منبع حقیقت).
 * ۱) پرچم قفل صریح روشن است → قفل. ۲) از آخرین فعالیت بیش از حد گذشته →
 * قفل (و زمان فعالیت جلو برده نمی‌شود، تا قفل پایدار بماند). ۳) در حال
 * کار → همین بازدید «فعالیت» ثبت و بدون قفل ادامه می‌دهد.
 */
export async function evaluateIdleLock(userId: number, timeoutMin: number): Promise<boolean> {
  if (!(timeoutMin > 0)) return false;
  if (await isSessionLocked(userId)) return true;
  if (await isIdle(userId, timeoutMin)) {
    /**
     * 🔒 قفل را همین‌جا **ثبت** کن، نه فقط گزارش.
     *
     * پیش‌تر این تابع صرفاً `true` برمی‌گرداند و ثبت پرچم به client action
     * (`lockNowAction`) سپرده شده بود؛ اگر آن اکشن رد می‌شد یا درخواست بعدی
     * (رفرش/تب جدید) به پروسهٔ دیگری می‌رفت، کارتابل بی‌رمز باز می‌شد. الان
     * خودِ layout هنگام رندر، قفل را پایدار می‌کند.
     */
    await setSessionLock(userId).catch(() => {});
    return true;
  }
  await touchActivity(userId);
  return false;
}

function clampMinutes(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.trunc(n), 24 * 60);
}

/**
 * سقف قفل بیکاری برای یک کاربر بر پایهٔ نقش‌هایش.
 * SESSION_LOCK_MINUTES_ROLES یک JSON اختیاری است مثل {"ADMIN":30,"STUDENT":0}
 * (۰ = غیرفعال برای آن نقش). اولین نقشِ منطبق برنده است، وگرنه پیش‌فرضِ عمومیِ
 * SESSION_LOCK_MINUTES.
 */
export async function resolveIdleTimeoutMinutes(roles: readonly string[] | null | undefined): Promise<number> {
  const { getNumber, getSetting } = await import('@/lib/settings');
  const fallback = await getNumber('SESSION_LOCK_MINUTES', 15).catch(() => 15);
  const raw = await getSetting('SESSION_LOCK_MINUTES_ROLES').catch(() => '');
  if (!raw) return clampMinutes(fallback);
  try {
    const map = JSON.parse(raw) as Record<string, unknown>;
    if (map && typeof map === 'object') {
      for (const r of roles ?? []) {
        if (!r || !(r in map)) continue;
        const v = map[r];
        if (v === undefined || v === null || v === '') continue;
        const n = Number(v);
        if (Number.isFinite(n)) return clampMinutes(n);
      }
    }
  } catch { /* JSON نامعتبر → پیش‌فرض */ }
  return clampMinutes(fallback);
}
