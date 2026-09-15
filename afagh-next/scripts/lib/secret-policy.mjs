#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  سیاست یکدست سکرت‌های پروداکشن — تنها منبع حقیقت (P0-1)
 *
 *  چرا یک فایل جدا؟ پیش از این، «رمز ضعیف چیست» در چهار جا دستی نوشته شده
 *  بود (Makefile check-env، deploy-debian.sh، hardening.mjs، .env.prod.example)
 *  و هر چهار تعریف کمی با هم فرق داشتند. اینجا یک بار تعریف می‌شود و همه از
 *  همینجا می‌خوانند؛ تست `tests/release-hardening.test.ts` هم همین را
 *  ملاک قرار می‌دهد.
 *
 *  مصرف:
 *    import { checkSecret, generateSecret, POLICY } from './lib/secret-policy.mjs';
 *    node scripts/lib/secret-policy.mjs --check .env        ← گیت خط فرمان
 * ════════════════════════════════════════════════════════════════════════
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const POLICY = {
  /** حداقل طول پذیرفته‌شده برای رمز دیتابیس (مالک و نقش محدود) */
  minLenDb: 24,
  /** حداقل طول MinIO root password (S3 signature فقط به بلندای کافی نیاز دارد) */
  minLenObject: 16,
  /** کف مطلق: زیر این، هر لایه‌ای باید رد کند */
  minHardLen: 12,
  /** طول رمزهای تصادفی که خودمان می‌سازیم */
  generatedLen: 32,
  /** مقدار نمونه/جای‌نگهدار در فایل‌های مثال (پیش‌شونده: CHANGE_ME_ANYTHING هم رد) */
  placeholder: /^(change_?me|replace_?me|set_?me|fill_?me|todo|your_?password|xxx+|yyy+)/i,
  /** مقادیر کوتاهِ همیشگی که باید «دقیقاً» رد شوند */
  exactWeak: ['password123', 'admin', 'root', 'pass'], 
  /** پیش‌فرض‌های ضعیفی که در compose برای توسعهٔ محلی گذاشته شده‌اند */
  knownWeak: [
    'afagh', 'afagh_app', 'afagh-app-pass', 'afagh-app-password', 'afagh-secret',
    'postgres', 'password', '123456', 'secret', 'minioadmin', 'admin123', 'test',
  ],
};

/**
 * بررسی یک سکرت.
 * @returns { ok: boolean, reason?: string }
 */
export function checkSecret(name, value, { minLen = POLICY.minLenDb, allowWeak = false, failOnShort = true } = {}) {
  const v = String(value ?? '');
  if (!v.trim()) return { ok: false, reason: `${name} خالی است — در .env مقدار تصادفی قوی بگذارید (make env)` };
  if (POLICY.placeholder.test(v.trim())) {
    // پرهیز از فاجعهٔ «CHANGE_ME روی اینترنت»: مقدار نمونه هرگز پذیرفته نمی‌شود،
    // اما در توسعهٔ محلی (ALLOW_WEAK_SECRETS=1) هشدار است نه خطا.
    if (allowWeak) return { ok: true, weak: true, reason: `${name} مقدار نمونه است — فقط برای توسعهٔ محلی قابل قبول` };
    return { ok: false, reason: `${name} هنوز مقدار نمونهٔ «${v}» است — باید عوض شود` };
  }
  const low = v.trim().toLowerCase();
  if (POLICY.knownWeak.includes(low) || POLICY.exactWeak.includes(low)) {
    if (allowWeak) return { ok: true, weak: true, reason: `${name} پیش‌فرض ضعیف توسعه است (ALLOW_WEAK_SECRETS=1)` };
    return { ok: false, reason: `${name} یکی از پیش‌فرض‌های ضعیف شناخته‌شده است («${v}») — در پروداکشن پذیرفته نمی‌شود` };
  }
  if (v.length < POLICY.minHardLen) {
    return { ok: false, reason: `${name} بیش از حد کوتاه است (${v.length} کاراکتر؛ کف مطلق ${POLICY.minHardLen})` };
  }
  if (v.length < minLen) {
    // دروازهٔ اپراتور (make check-env / deploy-debian.sh): خطا.
    // لایهٔ اجرایی (hardening، بوت اپ): هشدار — تا فیکسچرهای CI و نصب‌های
    // دستیِ کوتاه‌اما‌غیرقابل‌حدس را نکوبد؛ رمز قابل‌حدس/نمونه در هر دو لایه خطاست.
    if (failOnShort) return { ok: false, reason: `${name} کوتاه است (${v.length} کاراکتر؛ حداقل ${minLen})` };
    return { ok: true, short: true, reason: `${name} کوتاه‌تر از توصیهٔ سیاست است (${v.length}<${minLen}) — برای پروداکشن بلندترش کنید` };
  }
  if (/(.)\1{3,}/.test(v)) return { ok: false, reason: `${name} تکرار چهارتایی کاراکتر دارد («aaaa») — ضعیف است` };
  return { ok: true };
}

/** بررسی همهٔ سکرت‌های لازم پروداکشن؛ لیست خطاها را برمی‌گرداند (خالی = سالم) */
export function checkProdEnv(env, { allowWeak = false } = {}) {
  const errs = [];
  const one = (name, minLen) => {
    // دروازهٔ پروداکشنِ اپراتور: کوتاه‌بودن هم خطاست
    const r = checkSecret(name, env[name], { minLen, allowWeak, failOnShort: true });
    if (!r.ok) errs.push(r.reason);
  };
  one('POSTGRES_PASSWORD', POLICY.minLenDb);
  one('AFAGH_APP_DB_PASSWORD', POLICY.minLenDb);
  one('MINIO_ROOT_PASSWORD', POLICY.minLenObject);
  return errs;
}

/** رمز تصادفی خوانا برای .env (بدون کاراکترهای مشکل‌ساز در shell/compose) */
export function generateSecret(len = POLICY.generatedLen) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** تبدیل متن .env به شیء (بدون import بیرونی؛ همان قانون docker compose) */
export function parseDotEnv(text) {
  const out = {};
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

// ── حالت خط فرمان ──
//   --check [.env]   بررسی سکرت‌ها   ·   --gen [تعداد]   ساخت رمز تصادفی قوی
const CLI = process.argv[1] && process.argv[1].endsWith('secret-policy.mjs');
if (CLI && process.argv.includes('--gen')) {
  const n = Number(process.argv[process.argv.indexOf('--gen') + 1]);
  console.log(generateSecret(Number.isFinite(n) && n >= 16 ? n : POLICY.generatedLen));
}
if (CLI && process.argv.includes('--check')) {
  const file = process.argv[process.argv.indexOf('--check') + 1];
  let env = process.env;
  if (file && !file.startsWith('--')) {
    // اولویت همان doker compose: مقدارِ --env-file/.env بر ENV محیط پیروز است
    try { env = { ...process.env, ...parseDotEnv(readFileSync(file, 'utf8')) }; }
    catch { console.error(`❌ نمی‌توانم ${file} را بخوانم`); process.exit(2); }
  }
  const allowWeak = env.ALLOW_WEAK_SECRETS === '1';
  const errs = checkProdEnv(env, { allowWeak });
  if (errs.length) {
    console.error('🔒 سیاست سکرت‌های پروداکشن نقض شد:\n  - ' + errs.join('\n  - '));
    console.error('\n  ساخت .env با رمز تصادفی:  make env && ./deploy-debian.sh (رمزها را خودش می‌سازد)');
    console.error('  فقط برای توسعهٔ محلی   :  ALLOW_WEAK_SECRETS=1 make up');
    process.exit(1);
  }
  console.log('✓ سکرت‌ها با سیاست پروداکشن سازگارند (طول، عدم نمونه، عدم پیش‌فرض ضعیف)');
}
