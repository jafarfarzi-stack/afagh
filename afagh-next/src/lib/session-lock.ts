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
      // «سنگ قبر» به‌جای DEL: پروسه‌های دیگر که آینهٔ حافظه‌ای از قفل دارند، با
      // دیدن مقدار '0' قفل محلی را پاک می‌کنند. با DEL، آینهٔ کهنه تا ۲۴ ساعت
      // می‌توانست کاربر را در پروسهٔ دیگر قفل نگه دارد.
      await lockRedis.set(KEY(id), '0', 'EX', TTL_SEC);
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
  // پاک‌سازی عقب‌افتاده را اول انجام بده تا قفلِ پاک‌شده دوباره خوانده نشود
  await flushClears();
  if (Date.now() >= downUntil) {
    try {
      // 🎯 وقتی Redis در دسترس است، «منبع حقیقت» است — نه آینهٔ درون‌حافظه.
      //   پیش‌تر اول mem چک می‌شد؛ در استقرار چندپروسه‌ای، بازگشایی با رمز فقط
      //   آینهٔ همان پروسه را پاک می‌کرد و درخواست بعدی (که به پروسهٔ دیگر
      //   می‌رسید) دوباره «قفل» نشان می‌داد — همان تجربهٔ «رمز را زدم، باز هم
      //   قفل است».
      const v = await lockRedis.get(KEY(userId));
      if (v === '1') { mem.set(userId, Date.now() + TTL_SEC * 1000); return true; }
      if (v === '0') { mem.delete(userId); return false; }
      // کلید نیست؛ اگر این پروسه قفلِ فعال در حافظه دارد، نوشتن قبلی به Redis
      // نرسیده بود → دوباره ثبت کن (fail-closed) وگرنه باز است.
      const m = mem.get(userId);
      if (m != null && m > Date.now()) {
        await lockRedis.set(KEY(userId), '1', 'EX', TTL_SEC).catch(() => {});
        return true;
      }
      return false;
    } catch { downUntil = Date.now() + BREAKER_MS; }
  }
  // دوران قطعی Redis → آینهٔ درون‌حافظه (fail-closed)
  const m = mem.get(userId);
  return m != null && m > Date.now();
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
  if (Date.now() >= downUntil) {
    try {
      await flushSeen();
      // Redis منبع حقیقت است؛ آینهٔ حافظه فقط برای دوران قطعی.
      const v = await lockRedis.get(SEEN_KEY(userId));
      const n = v == null ? NaN : Number(v);
      if (Number.isFinite(n)) { seenMem.set(userId, n); return n; }
      // کلید نیست ولی این پروسه مقدار تازه‌تری در حافظه دارد (نوشتن نرسیده بود)
      return seenMem.get(userId) ?? null;
    } catch { downUntil = Date.now() + BREAKER_MS; }
  }
  return seenMem.get(userId) ?? null;
}

/** آیا از آخرین فعالیت بیش از timeoutMin دقیقه گذشته؟ (بدون به‌روزرسانی زمان) */
export async function isIdle(userId: number, timeoutMin: number): Promise<boolean> {
  if (!(timeoutMin > 0)) return false;
  const at = await lastActivityAt(userId);
  if (at === null) return false; // نخستین مشاهده — مبنایی برای بیکاری نیست
  return Date.now() - at > timeoutMin * 60_000;
}

/** چند دقیقه از آخرین فعالیت گذشته؟ null = هنوز ثبت نشده (نخستین مشاهده). */
export async function idleMinutes(userId: number): Promise<number | null> {
  const at = await lastActivityAt(userId);
  if (at === null) return null;
  return (Date.now() - at) / 60_000;
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
 * سقف «غیبت طولانی» — بیش از این مدت ⇒ پایان نشستِ همین دستگاه و صفحهٔ ورود.
 *
 * تفاوت با SESSION_LOCK_MINUTES: آن یکی فقط صفحه را قفل می‌کند (رمز همان
 * نشست را می‌گیرد)؛ این یکی نشست را می‌بندد. چرا لازم است: قفل بیکاری هنگام
 * رندر layout روی «آخرین فعالیت» حساب می‌شد، پس کسی که دو ساعت بعد آدرس را
 * باز می‌کرد، همان قفل را روی صفحهٔ کهنه می‌دید. رفتار درست: غیبت طولانی =
 * ورود دوباره با صفحهٔ ورود تمیز.
 *
 * مقدار ۰ = غیرفعال. مقدار مؤثر هرگز کمتر از «سقف قفل بیکاری + ۵ دقیقه»
 * نیست تا اول قفل نمایش داده شود و سپس در غیبت طولانی‌تر، ورود مجدد.
 */
export async function resolveReauthMinutes(idleTimeoutMin = 0): Promise<number> {
  const { getNumber } = await import('@/lib/settings');
  const n = clampMinutes(await getNumber('SESSION_REAUTH_MINUTES', 30).catch(() => 30));
  if (n <= 0) return 0;
  return Math.max(n, idleTimeoutMin > 0 ? idleTimeoutMin + 5 : 0);
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
