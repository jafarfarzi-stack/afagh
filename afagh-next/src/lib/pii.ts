import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔒 رمزنگاری داده‌های هویتی (PII) — کد ملی و مانند آن
 *
 *  چرا این ماژول؟
 *  کد ملی در پایگاه داده به‌صورت متن ساده ذخیره می‌شد. هشِ ساده ممکن نیست،
 *  چون کارمند مجاز باید خودِ کد را ببیند (کارت دانشجویی، کارنامه، قرارداد).
 *  بنابراین دو ستون لازم است:
 *
 *    ۱) شاخص کور (blind index) — HMAC-SHA256 برای جست‌وجوی برابری
 *       (`blindIndex`)؛ قابل برگشت نیست و بدون کلید قابل محاسبه نیست.
 *    ۲) متن رمزشده — AES-256-GCM برای نمایش به کاربر مجاز
 *       (`encryptPii` / `decryptPii`).
 *
 *  قرارداد پاکت رمز عیناً همان `src/lib/samin/crypto.ts` است تا کل کدبیس
 *  یکسان بماند: IV تصادفی ۱۲ بایتی، tag احراز اصالت ۱۶ بایتی، همه hex،
 *  قالب `iv:tag:data`. تنها تفاوت، پیشوند نسخه (`v1:`) است تا در آینده
 *  بتوان بدون حدس، نسخهٔ پاکت را تشخیص داد.
 *
 *  ── برنامهٔ مهاجرت (فقط مستند — هیچ migration ای در این فایل نیست) ──
 *  گام ۱: افزودن دو ستون تازه به جدول‌های دارندهٔ کد ملی:
 *          `nationalCodeIndex` (text, nullable) و `nationalCodeEnc` (text, nullable).
 *          در همین گام برای هر دو ستون ایندکس (ترجیحاً یکتا روی شاخص) ساخته می‌شود.
 *  گام ۲: backfill در جاهای خالی — برای هر ردیف موجود:
 *          `nationalCodeEnc = encryptPii(nationalCode)` و
 *          `nationalCodeIndex = blindIndex(nationalCode, '<جدول>.nationalCode')`.
 *          backfill باید idempotent باشد (`WHERE nationalCodeEnc IS NULL`).
 *  گام ۳: مهاجرت خواندن/نوشتن کد — نوشتن‌های تازه هر دو ستون را پر می‌کنند؛
 *          خواندن ابتدا از `nationalCodeEnc` و در نبود آن (ردیف مهاجرت‌نشده)
 *          از ستون متن ساده استفاده می‌کند. جست‌وجوها به `nationalCodeIndex`
 *          منتقل می‌شوند (نه `nationalCode`).
 *  گام ۴: بازبینی و شمارش — هیچ ردیفی نباید `nationalCodeEnc IS NULL` داشته باشد
 *          و شاخص‌ها باید با مقدار متن ساده هم‌خوان باشند.
 *  گام ۵: حذف ستون متن ساده (`DROP COLUMN nationalCode`) پس از تأیید پشتیبان.
 *          از این نقطه به بعد، `decryptPii` تنها راه دیدن کد است.
 *
 *  نکتهٔ امنیتی: `context` در `blindIndex` عمداً اجباری است. همان کد ملی در
 *  جدول‌های مختلف شاخص متفاوت می‌گیرد تا تطبیق ردیف‌ها بین جدول‌ها ممکن نباشد
 *  (و افشای یک جدول، جدول دیگر را قابل تطبیق نکند).
 *
 *  ⚠ این ماژول فقط سمت سرور است (node:crypto). عمداً `server-only` import
 *  نمی‌کند تا در تست‌های tsx قابل استفاده باشد؛ از import در کامپوننت کلاینت
 *  خودداری کنید.
 * ══════════════════════════════════════════════════════════════════════
 */

/** نام متغیر محیطی کلید اصلی PII (۶۴ کاراکتر hex یا عبارت عبور) */
export const PII_KEY_ENV = 'AFAGH_PII_KEY';

/** پیشوند نسخهٔ پاکت رمز — تغییر آن یعنی تغییر قالب ذخیره‌سازی */
const ENVELOPE_VERSION = 'v1';

/** طول IV و tag طبق قرارداد AES-GCM (همان samin/crypto.ts) */
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * نمک مشتق‌سازی کلید از عبارت عبور.
 *
 * ثابت است چون مشتق‌سازی باید deterministic باشد؛ در غیر این صورت
 * ciphertextهای دیروز با کلید امروز باز نمی‌شوند. نمک «راز» نیست و فقط
 * از پیش‌محاسبهٔ جدول مشترک بین چند نصب جلوگیری می‌کند.
 */
const PASSPHRASE_SALT = 'afagh:pii:v1';

/** پارامترهای scrypt — هزینهٔ حافظهٔ ۱۶ مگابایت، مطابق الگوی مهاجرت پروژه */
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/**
 * کلید جایگزین توسعه — فقط وقتی `NODE_ENV !== 'production'` و کلید تنظیم نشده
 * باشد. مقدار آن عمداً عمومی است: هر دادهٔ رمزشده با این کلید در محیط توسعه
 * قابل بازگشایی است و **هرگز** نباید به پروداکشن برسد.
 */
const DEV_FALLBACK_SECRET = 'afagh-dev-pii-key-not-for-production';

/** کش کلید مشتق‌شده — کلید بر اساس مقدار خام ENV و نمک، تا تست‌ها بتوانند ENV را عوض کنند */
const keyCache = new Map<string, Buffer>();
let warnedDevFallback = false;

/**
 * ساخت بافر کلید ۳۲ بایتی از مقدار خام.
 *   • ۶۴ کاراکتر hex → همان ۳۲ بایت (کلید واقعی AES-256)
 *   • هر چیز دیگر → عبارت عبور؛ با scrypt به ۳۲ بایت مشتق می‌شود
 */
function deriveKey(raw: string): Buffer {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  return scryptSync(value, PASSPHRASE_SALT, 32, SCRYPT_OPTS);
}

/**
 * کلید اصلی PII.
 *
 * fail-closed: در `NODE_ENV=production` اگر `AFAGH_PII_KEY` تنظیم نشده باشد
 * (یا خالی باشد) خطا می‌دهد — هیچ پیش‌فرضی در پروداکشن پذیرفته نمی‌شود.
 * در توسعه/تست، برای اینکه راه‌اندازی محلی بی‌دردسر باشد، از یک کلید ثابت
 * عمومی استفاده می‌شود و یک هشدار یک‌باره چاپ می‌شود.
 *
 * خروجی Buffer است (نه رشته) تا هم‌قرارداد `samin/crypto.ts` بماند.
 */
export function piiKey(): Buffer {
  const raw = (process.env[PII_KEY_ENV] ?? '').trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `${PII_KEY_ENV} تعریف نشده است — رمزنگاری داده‌های هویتی در پروداکشن بدون کلید مجاز نیست.`,
      );
    }
    if (!warnedDevFallback) {
      warnedDevFallback = true;
      console.warn(
        `[pii] ⚠ ${PII_KEY_ENV} تنظیم نشده — کلید توسعهٔ عمومی استفاده می‌شود. ` +
        'این حالت فقط برای توسعه/تست است و داده‌های رمزشدهٔ آن قابل انتقال به پروداکشن نیست.',
      );
    }
    return deriveKey(DEV_FALLBACK_SECRET);
  }

  const cacheKey = `${PASSPHRASE_SALT}\u0000${raw}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;
  const key = deriveKey(raw);
  // تعداد کلیدهای ممکن در یک پروسه بسیار کم است؛ سقف کوچک برای جلوگیری از رشد نامحدود
  if (keyCache.size >= 8) keyCache.clear();
  keyCache.set(cacheKey, key);
  return key;
}

/**
 * نرمال‌سازی مقدار PII برای شاخص کور.
 *
 * • ارقام فارسی (۰-۹) و عربی-هندی (٠-٩) → ارقام لاتین
 * • حذف فاصله‌ها (شامل نیم‌فاصله) و انواع خط تیره
 * • trim
 *
 * چرا؟ کاربران کد ملی را با ارقام فارسی، فاصله یا خط تیره وارد می‌کنند؛
 * بدون نرمال‌سازی، یک کد ملی چند شاخص کور متفاوت می‌سازد و جست‌وجوی برابری
 * از کار می‌افتد.
 */
export function normalizePiiValue(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    // فاصله‌های یونیکد + نیم‌فاصله/جهت‌دهی + انواع خط تیره
    .replace(/[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[‐‑‒–—―−-]/g, '')
    .trim();
}

/** آیا این مقدار پاکت رمزشدهٔ نسخهٔ فعلی است؟ (برای backfill idempotent) */
export function isPiiCiphertext(value: string | null | undefined): boolean {
  const v = String(value ?? '');
  const parts = v.split(':');
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) return false;
  const [, iv, tag, data] = parts;
  return (
    /^[0-9a-f]{24}$/i.test(iv) &&
    /^[0-9a-f]{32}$/i.test(tag) &&
    /^[0-9a-f]*$/i.test(data) &&
    data.length % 2 === 0
  );
}

/**
 * رمزگذاری مقدار PII با AES-256-GCM.
 *
 * خروجی: `v1:<ivHex>:<tagHex>:<dataHex>`
 * مقدار خالی/`null` → رشتهٔ خالی (ستون باید NULL بماند؛ رمزکردن «خالی» بی‌معناست).
 *
 * IV هر بار تصادفی است، پس دو رمزگذاری از یک مقدار، خروجی یکسان نمی‌دهند.
 */
export function encryptPii(plain: string | null | undefined): string {
  const text = String(plain ?? '');
  if (!text) return '';
  const key = piiKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * رمزگشایی پاکت `v1:<iv>:<tag>:<data>`.
 *
 * fail-closed: برخلاف `decryptSecret` در ثمین، مقدار بدون پاکت **به‌عنوان
 * متن ساده برگردانده نمی‌شود**؛ چون در مسیر PII این کار یعنی افشای خام و
 * پنهان‌کردن خطای مهاجرت. هر ناسازگاری (پیشوند، طول، hex نامعتبر، دستکاری
 * ciphertext/tag/iv یا کلید اشتباه) خطا می‌دهد. پیام خطا هیچ بخشی از داده را
 * لو نمی‌دهد.
 */
export function decryptPii(cipher: string | null | undefined): string {
  const raw = String(cipher ?? '');
  if (!raw) return '';

  if (!isPiiCiphertext(raw)) {
    throw new Error('دادهٔ رمزشدهٔ PII معتبر نیست — پاکت ناشناخته یا ناقص است.');
  }

  const [, ivHex, tagHex, dataHex] = raw.split(':');
  const key = piiKey();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    // Buffer.from(hex) در صورت hex نامعتبر طول را کوتاه می‌کند، ولی isPiiCiphertext
    // قبلاً قالب را سخت‌گیرانه بررسی کرده است.
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    // عمداً خطای اصلی GCM («unable to authenticate data») به بیرون درز نمی‌کند
    throw new Error(
      'رمزگشایی PII ناموفق بود — داده دستکاری شده است یا کلید رمزنگاری اشتباه/عوض‌شده است.',
    );
  }
}

/**
 * شاخص کور برای جست‌وجوی برابری: HMAC-SHA256 hex (۶۴ کاراکتر).
 *
 * پیام امضاشده: `<نسخه>|<context>|<مقدار نرمال‌شده>` — یعنی context بخشی از
 * دامنه است، نه فقط برچسب. پس:
 *   blindIndex('0012345678', 'users.nationalCode')
 *     ≠ blindIndex('0012345678', 'admissions_staging.nationalCode')
 *
 * `context` را ثابت و صریح بدهید (مثلاً `'users.nationalCode'`) و هرگز وسط
 * کار عوض نکنید؛ تغییر آن یعنی همهٔ شاخص‌های آن ستون بی‌اعتبار می‌شوند.
 *
 * مقدار نرمال‌شدهٔ خالی یا context خالی خطا می‌دهد تا ردیف‌های بی‌مقدار
 * شاخص مشترک نگیرند.
 */
export function blindIndex(value: string | null | undefined, context: string): string {
  const normalized = normalizePiiValue(value);
  const ctx = String(context ?? '').trim();
  if (!normalized) throw new Error('شاخص کور برای مقدار خالی ساخته نمی‌شود.');
  if (!ctx) throw new Error('ساخت شاخص کور بدون context (نام جدول/ستون) مجاز نیست.');

  // کلید فرعی مخصوص شاخص کور تا از کلید رمزنگاری دامنه‌جدا بماند
  const indexKey = createHmac('sha256', piiKey())
    .update(`${PASSPHRASE_SALT}:blind-index`)
    .digest();

  return createHmac('sha256', indexKey)
    .update(`${ENVELOPE_VERSION}|${ctx}|${normalized}`, 'utf8')
    .digest('hex');
}

/**
 * ماسک نمایش کد ملی — عیناً همان قرارداد `maskNationalCode` در
 * `src/lib/verification.ts` (سه رقم اول + پنج ستاره + دو رقم آخر، طول ثابت).
 *
 * چرا import نمی‌کنیم؟ `verification.ts` هم `server-only` دارد و هم به اتصال
 * پایگاه داده وابسته است؛ import آن، این ماژول را برای تست tsx غیرقابل‌بارگذاری
 * می‌کند. اگر روزی ماسک تغییر کرد، هر دو نقطه باید هم‌زمان به‌روز شوند
 * (تست `pii.test.ts` رفتار فعلی را قفل می‌کند).
 */
export function maskPii(value: string | null | undefined): string {
  const c = String(value ?? '').trim();
  if (!c) return '—';
  if (c.length <= 5) return '*****';
  return `${c.slice(0, 3)}*****${c.slice(-2)}`;
}
