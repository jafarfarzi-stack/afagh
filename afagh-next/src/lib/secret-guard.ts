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
 * در production اجرا می‌شود و روی نقض، startup را می‌بندد (fail-closed).
 * در build (NEXT_PHASE) و توسعه فقط هشدار می‌دهد.
 */
export function assertProdSecrets(): void {
  if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PHASE) return;
  const allowWeak = process.env.ALLOW_WEAK_SECRETS === '1';
  const checks = [checkDbSecret('AFAGH_APP_DB_PASSWORD', appRoleSecret(), allowWeak)];
  if (process.env.DATABASE_URL) {
    try {
      const owner = decodeURIComponent(new URL(process.env.DATABASE_URL).password || '');
      checks.push(checkDbSecret('رمز کاربر مالک در DATABASE_URL', owner, allowWeak));
    } catch { /* URL غیراستاندارد — اتصال خودش خطا می‌دهد */ }
  }
  for (const r of checks) {
    if (!r.ok) {
      throw new Error(
        `[db] 🔒 ${r.reason}\n` +
        '   این سرور با پیکربندی ناامن بالا نمی‌آید (سیاست پروداکشن).\n' +
        '   رمز قوی:  node scripts/lib/secret-policy.mjs --gen   ·   راهنما: make check-env',
      );
    }
    if (r.weak) console.warn('[db] ⚠ سکرت ضعیف با ALLOW_WEAK_SECRETS=1 پذیرفته شد — فقط برای توسعه/دمو.');
    if (r.short) console.warn(`[db] ⚠ ${r.reason} — برای پروداکشن بلندترش کنید.`);
  }
}
