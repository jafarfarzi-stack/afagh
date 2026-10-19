/**
 * 🔒 گارد پروداکشنِ اتصال دیتابیس (P0-1 — لایهٔ نهایی، داخل خود اپ)
 *
 * چرا این‌جا هم؟ compose و `make check-env` و hardening.mjs همه قبل از ما چک
 * می‌کنند، ولی سه راهِ دورزدن وجود داشت: اجرای مستقیم `docker run` با ENV دستی،
 * نصب روی bare-metal (بدون داکر) و تغییر اسکریپت نصب. پس کد اپ هم
 * رمزِ نقش محدود را نمی‌پذیرد (`afagh_app`) با پیش‌فرض ضعیف — یعنی RLS روی نقشی نشیند که
 * رمزش قابل حدس است.
 *
 * سیاستِ اصلی (فهرست و طول‌ها) این‌جاست و `scripts/lib/secret-policy.mjs` همان را
 * برای اسکریپت‌های عملیاتی نگه می‌دارد؛ تست `tests/release-hardening.test.ts`
 * می‌گیرد که این دو فهرست از هم جلو نمی‌زنند.
 *
 * خاموش‌کردن فقط برای توسعه/دمو: `ALLOW_WEAK_SECRETS=1`
 */
const WEAK_DB_SECRETS = [
  'afagh', 'afagh_app', 'afagh-app-pass', 'afagh-app-password', 'afagh-secret',
  'postgres', 'password', '123456', 'secret', 'minioadmin', 'admin123', 'test',
];
const PLACEHOLDER_PREFIX = /^(change_?me|replace_?me|set_?me|fill_?me|todo|your_?password|xxx+|yyy+)/i;
const MIN_LEN = 24;   // توصیهٔ سیاست پروداکشن
const MIN_HARD_LEN = 12; // زیر این، هر لایه‌ای باید رد کند

export type SecretVerdict =
  | { ok: true; weak?: boolean; short?: boolean; reason?: string }
  | { ok: false; reason: string };

export function checkDbSecret(name: string, value: string | undefined, allowWeak = false): SecretVerdict {
  const v = (value ?? '').trim();
  if (!v) return { ok: false, reason: `${name} تعیین نشده است` };
  if (PLACEHOLDER_PREFIX.test(v)) {
    return allowWeak
      ? { ok: true, weak: true }
      : { ok: false, reason: `${name} هنوز مقدار نمونهٔ «${v}» است — در .env رمز تصادفی بگذارید` };
  }
  if (WEAK_DB_SECRETS.includes(v.toLowerCase())) {
    return allowWeak
      ? { ok: true, weak: true }
      : { ok: false, reason: `${name} یکی از پیش‌فرض‌های ضعیفِ شناخته‌شده است — در پروداکشن پذیرفته نمی‌شود` };
  }
  if (v.length < MIN_HARD_LEN) {
    return { ok: false, reason: `${name} بیش از حد کوتاه است (${v.length} کاراکتر؛ کف مطلق ${MIN_HARD_LEN})` };
  }
  if (v.length < MIN_LEN) {
    // کوتاه اما غیرقابل‌حدس → هشدار (فیکسچرهای تست و نصب‌های دستی را نکوبد)
    return { ok: true, short: true, reason: `${name} کوتاه‌تر از توصیهٔ سیاست است (${v.length}<${MIN_LEN})` };
  }
  return { ok: true };
}

/** رمزِ نقش محدود از ENV یا ازون DATABASE_URL_APP */
function appRoleSecret(): string {
  if (process.env.AFAGH_APP_DB_PASSWORD) return process.env.AFAGH_APP_DB_PASSWORD;
  const u = process.env.DATABASE_URL_APP;
  if (!u) return '';
  try {
    return decodeURIComponent(new URL(u).password || '');
  } catch {
    return '';
  }
}

/**
 * کلیدهای S3/MinIO — همان قرارداد objectStore.ts (S3_* وگرنه MINIO_ROOT_*).
 * خالی یعنی «تنظیم نشده»؛ پر بودن با پیش‌فرض توسعه یعنی «نصب ناامن».
 */
function s3AccessKey(): string {
  return (process.env.S3_ACCESS_KEY || process.env.MINIO_ROOT_USER || '').trim();
}
function s3SecretKey(): string {
  return (process.env.S3_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '').trim();
}

/** پیش‌فرض‌های عمومیِ توسعه — هرگز در پروداکشن پذیرفته نمی‌شوند */
export const S3_DEV_DEFAULT_ACCESS_KEY = 'afagh';
export const S3_DEV_DEFAULT_SECRET_KEY = 'afagh-secret';

/**
 * گارد fail-closed کلیدهای Object Storage.
 *
 * برخلاف رمزهای نقش DB، اینجا سیاست «طول/ساختار» اعمال نمی‌شود (کلید دسترسی S3
 * می‌تواند کوتاه باشد)؛ فقط دو حالت کشنده رد می‌شود:
 *   ۱) هرکدام تنظیم نشده → objectStore با پیش‌فرض داخلی بالا می‌آمد (پیش‌تر فقط
 *      هشدار می‌داد ⇒ در سکوت نصب ناامن بود).
 *   ۲) برابر با پیش‌فرض عمومی توسعه (`afagh` / `afagh-secret`) → بایگانی اسناد
 *      دانشجویان عملاً بدون رمز است.
 *
 * همان escape hatch سیاست DB: `ALLOW_WEAK_SECRETS=1` (فقط توسعه/دمو).
 */
export function checkObjectStoreCredentials(allowWeak = process.env.ALLOW_WEAK_SECRETS === '1'): SecretVerdict {
  const access = s3AccessKey();
  const secret = s3SecretKey();
  if (!access || !secret) {
    return allowWeak
      ? { ok: true, weak: true }
      : { ok: false, reason: 'کلیدهای Object Storage (S3_ACCESS_KEY / S3_SECRET_KEY یا MINIO_ROOT_USER / MINIO_ROOT_PASSWORD) تنظیم نشده‌اند' };
  }
  if (access === S3_DEV_DEFAULT_ACCESS_KEY || secret === S3_DEV_DEFAULT_SECRET_KEY) {
    return allowWeak
      ? { ok: true, weak: true }
      : { ok: false, reason: 'کلیدهای Object Storage یکی از پیش‌فرض‌های عمومی توسعه (afagh / afagh-secret) است — در پروداکشن پذیرفته نمی‌شود' };
  }
  return { ok: true };
}

/**
 * در production اجرا می‌شود و روی نقض، startup را می‌بندد (fail-closed).
 * در build (NEXT_PHASE) و توسعه فقط هشدار می‌دهد.
 *
 * ── سخت‌ترشدنِ فاز ۲ (دروازهٔ راه‌اندازیِ پروداکشن) ──
 * پیش از این، رمزِ کوتاه (۱۲ تا ۲۳ کاراکتر؛ بین MIN_HARD_LEN و MIN_LEN) در
 * پروداکشن فقط هشدار می‌گرفت و سرور با رمزی زیر توصیهٔ سیاستِ ۲۴ کاراکتری بالا
 * می‌آمد. اکنون:
 *   ۱) کوتاه‌بودنِ رمز در پروداکشن خطای سخت است، مگر آن‌که escape hatch
 *      توسعه/دمو (`ALLOW_WEAK_SECRETS=1`) روشن باشد.
 *   ۲) اگر همان escape hatch در `NODE_ENV=production` روشن باشد، یک هشدار
 *      CRITICAL بلند چاپ می‌شود تا اشتباه روی سرور واقعی استفاده نشود.
 * توجه: `checkDbSecret` دست‌نخورده مانده چون hardening/migrator به رفتار
 * لایهٔ پیشین تکیه می‌کنند؛ فقط همین دروازهٔ startup سخت‌تر شده است.
 */
export function assertProdSecrets(): void {
  if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PHASE) return;
  const allowWeak = process.env.ALLOW_WEAK_SECRETS === '1';
  if (allowWeak) {
    // فاز ۲: escape hatch را بلند و صریح اعلام می‌کنیم (بی‌صدا خاموش نمی‌شود،
    // چون ایمیج دمو به آن تکیه دارد) — ولی هیچ‌کس نباید آن را روی پروداکشن بگذارد.
    console.warn(
      '🚨 [CRITICAL] ALLOW_WEAK_SECRETS=1 در پروداکشن فعال است — سکرت‌های ضعیف/کوتاه پذیرفته می‌شوند.\n' +
      '   این حالت فقط برای دمو/نمایش (showcase) است و روی سرور واقعی ممنوع است.\n' +
      '   برای پروداکشن: ALLOW_WEAK_SECRETS را بردارید و رمزها را با `make env` بسازید.',
    );
  }
  const checks = [checkDbSecret('AFAGH_APP_DB_PASSWORD', appRoleSecret(), allowWeak)];
  if (process.env.DATABASE_URL) {
    try {
      const owner = decodeURIComponent(new URL(process.env.DATABASE_URL).password || '');
      checks.push(checkDbSecret('رمز کاربر مالک در DATABASE_URL', owner, allowWeak));
    } catch { /* URL غیراستاندارد — اتصال خودش خطا می‌دهد */ }
  }
  // P1: کلیدهای S3/MinIO هم fail-closed. objectStore.ts همین گارد را هنگام ساخت
  // کلاینت صدا می‌زند؛ اینجا فقط لایهٔ startup است تا علت همان‌جا دیده شود.
  checks.push(checkObjectStoreCredentials(allowWeak));
  const access = s3AccessKey();
  const secret = s3SecretKey();
  if (access) checks.push(checkDbSecret('S3_ACCESS_KEY', access, allowWeak));
  if (secret) checks.push(checkDbSecret('S3_SECRET_KEY', secret, allowWeak));
  for (const r of checks) {
    if (!r.ok) {
      throw new Error(
        `[db] 🔒 ${r.reason}\n` +
        '   این سرور با پیکربندی ناامن بالا نمی‌آید (سیاست پروداکشن).\n' +
        '   رمز قوی:  node scripts/lib/secret-policy.mjs --gen   ·   راهنما: make check-env',
      );
    }
    // فاز ۲: کوتاه‌بودنِ رمز در پروداکشن خطای سخت است (قبلاً فقط هشدار بود)؛
    // تنها escape hatch توسعه/دمو آن را به هشدار تنزل می‌دهد.
    if (r.short && !allowWeak) {
      throw new Error(
        `[db] 🔒 ${r.reason}\n` +
        `   حداقل توصیه‌شدهٔ پیکربندی پروداکشن ${MIN_LEN} کاراکتر است و این سرور با رمز کوتاه‌تر بالا نمی‌آید.\n` +
        '   رمز قوی:  node scripts/lib/secret-policy.mjs --gen   ·   راهنما: make check-env',
      );
    }
    if (r.weak) console.warn('[db] ⚠ سکرت ضعیف با ALLOW_WEAK_SECRETS=1 پذیرفته شد — فقط برای توسعه/دمو.');
    if (r.short) console.warn(`[db] ⚠ ${r.reason} — برای پروداکشن بلندترش کنید.`);
  }
  if (!access && !secret) {
    console.warn(
      '[s3] ⚠ هیچ‌یک از S3_ACCESS_KEY / S3_SECRET_KEY (یا MINIO_ROOT_USER / MINIO_ROOT_PASSWORD) تنظیم نشده است — ' +
      'پیش‌فرض توسعه فقط در حالت غیرپروداکشن مجاز است.',
    );
  }
}
