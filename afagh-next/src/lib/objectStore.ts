import * as Minio from 'minio';
import { createHash, randomBytes } from 'crypto';
import { createLogger } from '@/lib/logger';
import {
  S3_DEV_DEFAULT_ACCESS_KEY,
  S3_DEV_DEFAULT_SECRET_KEY,
  checkObjectStoreCredentials,
} from '@/lib/secret-guard';

// ═══ Object Storage — سند §۲۴۳۸: «فایل‌ها خارج از DB؛ فقط URL در دیتابیس» ═══
// MinIO (سازگار با S3) — در پروداکشن همان کد به S3/Cloudine وصل می‌شود.
//
// ═══ سخت‌ترشدن (بازبینی امنیتی ۱۴۰۵) ═══
// ۱) کلیدهای حساب سرویس (MINIO_ACCESS_KEY/MINIO_SECRET_KEY) بر کلید روت مقدم‌اند؛
//    اگر اپ با کلید روت بالا بیاید، یک هشدار فارسی (بدون هیچ رمزی) ثبت می‌شود.
// ۲) باکت پشتیبان از باکت اسناد جدا شد (BACKUP_BUCKET) — پشتیبان‌ها دیگر کنار
//    مدارک دانشجویان نمی‌نشینند.
// ۳) وجود باکت اسناد یک‌بار در هر پروسه بررسی می‌شود و «ساخته نمی‌شود»؛ باکت
//    پشتیبان یک‌بار (memoised) به‌صورت تنبل ساخته می‌شود.
// ۴) نوشتن‌ها SSE (AES256) را درخواست می‌کنند و اگر سرور پشتیبانی نکند، با یک
//    هشدار فارسی بدون رمزنگاری ادامه می‌دهند (کاربر هرگز خطای دروغ نمی‌بیند).
const log = createLogger({ mod: 'lib.objectStore' });

type MinioGlobal = {
  __afaghMinio?: Minio.Client;
  __afaghBucketProbe?: Map<string, BucketProbe>;
  __afaghBackupBucketReady?: Promise<void>;
};
const g = globalThis as unknown as MinioGlobal;

/**
 * کلیدهای اتصال Object Storage — fail-closed در پروداکشن.
 *
 * پیش‌تر `afagh` / `afagh-secret` (پیش‌فرض عمومیِ داکر-کامپوز) جای کلید واقعی
 * می‌نشست و `secret-guard` فقط `console.warn` می‌کرد ⇒ نصب ناامن در سکوت بالا
 * می‌آمد و بایگانی اسناد دانشجویان با رمز قابل حدس سرو می‌شد. حالا همان سیاستِ
 * رمز DB اعمال می‌شود: در production «تنظیم‌نشده» یا «برابر پیش‌فرض عمومی» یعنی
 * throw. توسعه/دمو همچنان پیش‌فرض‌ها را می‌گیرد (یا با `ALLOW_WEAK_SECRETS=1`).
 * در فاز build (`NEXT_PHASE`) ساخته نمی‌شود تا `next build` نشکند.
 *
 * ترتیب نام‌ها: MINIO_ACCESS_KEY/MINIO_SECRET_KEY (حساب سرویس محدود) ←
 * S3_ACCESS_KEY/S3_SECRET_KEY ← MINIO_ROOT_USER/MINIO_ROOT_PASSWORD (فقط سازگاری).
 * کلید روت هرگز نباید در پروداکشن به اپ داده شود؛ `docs/minio-hardening.md`.
 */
type ResolvedS3Credentials = {
  accessKey: string;
  secretKey: string;
  /** آیا کلید از نام‌های تازهٔ حساب سرویس آمده؟ (تعیین‌کنندهٔ مسیر اعتبارسنجی) */
  usingServiceAccountNames: boolean;
};

/**
 * همان دو قاعدهٔ `checkObjectStoreCredentials` (تنظیم‌شده + نه پیش‌فرض عمومی)
 * اما روی مقادیرِ واقعاً استفاده‌شده — چون گاردِ repo فقط نام‌های قدیمی را می‌خواند
 * و با نام‌های تازه «تنظیم‌نشده» می‌بیند.
 */
function checkResolvedCredentials(
  accessKey: string,
  secretKey: string,
  allowWeak: boolean,
): { ok: true; weak?: boolean } | { ok: false; reason: string } {
  if (!accessKey || !secretKey) {
    return allowWeak
      ? { ok: true, weak: true }
      : { ok: false, reason: 'کلیدهای Object Storage تنظیم نشده‌اند (MINIO_ACCESS_KEY/MINIO_SECRET_KEY)' };
  }
  if (accessKey === S3_DEV_DEFAULT_ACCESS_KEY || secretKey === S3_DEV_DEFAULT_SECRET_KEY) {
    return allowWeak
      ? { ok: true, weak: true }
      : { ok: false, reason: 'کلیدهای Object Storage یکی از پیش‌فرض‌های عمومی توسعه (afagh / afagh-secret) است — در پروداکشن پذیرفته نمی‌شود' };
  }
  return { ok: true };
}

function resolveS3Credentials(): ResolvedS3Credentials {
  const usingServiceAccountNames = Boolean(
    (process.env.MINIO_ACCESS_KEY || '').trim() || (process.env.MINIO_SECRET_KEY || '').trim(),
  );
  const accessKey = (process.env.MINIO_ACCESS_KEY || process.env.S3_ACCESS_KEY || process.env.MINIO_ROOT_USER || '').trim();
  const secretKey = (process.env.MINIO_SECRET_KEY || process.env.S3_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '').trim();
  const isProd = process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE;
  const allowWeak = process.env.ALLOW_WEAK_SECRETS === '1';

  if (isProd) {
    // گاردِ repo فقط وقتی معنا دارد که کلیدها از نام‌های قدیمی آمده باشند؛
    // در حالت نام‌های تازه، همان قواعد روی مقادیرِ واقعی اعمال می‌شود.
    const verdicts: ({ ok: true; weak?: boolean } | { ok: false; reason: string })[] = [
      checkResolvedCredentials(accessKey, secretKey, allowWeak),
    ];
    if (!usingServiceAccountNames) verdicts.push(checkObjectStoreCredentials(allowWeak));
    const bad = verdicts.find((v): v is { ok: false; reason: string } => !v.ok);
    if (bad) {
      throw new Error(
        `[s3] 🔒 ${bad.reason}\n` +
        '   این سرور با پیکربندی ناامن بالا نمی‌آید (سیاست پروداکشن).\n' +
        '   راهنما: make check-env   ·   سخت‌ترسازی MinIO: docs/minio-hardening.md   ·   فرار موقت توسعه/دمو: ALLOW_WEAK_SECRETS=1',
      );
    }
  }

  if (isProd && (!accessKey || !secretKey)) {
    // فقط با ALLOW_WEAK_SECRETS=1 قابل رسیدن است — و عمداً پرصدا می‌ماند.
    console.warn('[s3] ⚠ کلید Object Storage تنظیم نشده و پیش‌فرض توسعه استفاده می‌شود (ALLOW_WEAK_SECRETS=1).');
  }
  return {
    accessKey: accessKey || S3_DEV_DEFAULT_ACCESS_KEY,
    secretKey: secretKey || S3_DEV_DEFAULT_SECRET_KEY,
    usingServiceAccountNames,
  };
}

const s3Credentials = resolveS3Credentials();

// ── هشدار «اتصال با کاربر روت» — یک‌بار در هر پروسه، هرگز رمز را چاپ نمی‌کند ──
let warnedRootCredentials = false;

function warnIfRootCredentials(accessKey: string): void {
  if (warnedRootCredentials) return;
  const rootUser = (process.env.MINIO_ROOT_USER || '').trim();
  const looksRoot =
    accessKey === 'minioadmin' ||
    (rootUser.length > 0 && accessKey === rootUser) ||
    process.env.MINIO_USE_ROOT === '1';
  if (!looksRoot) return;
  warnedRootCredentials = true;
  log.warn('object_store_root_credentials', {
    detail:
      'اتصال Object Storage با کلید روت (root/minioadmin) انجام می‌شود؛ هر نقص در اپ دسترسی کامل به همهٔ باکت‌ها می‌دهد. ' +
      'یک حساب سرویسِ محدود به باکت اسناد و باکت پشتیبان بسازید و MINIO_ACCESS_KEY/MINIO_SECRET_KEY را تنظیم کنید — docs/minio-hardening.md',
  });
}

warnIfRootCredentials(s3Credentials.accessKey);

// ── باکت‌ها ──
/** باکت اسناد دانشجویان (فقط URL/کلید در DB می‌ماند) */
export const ARCHIVE_BUCKET = process.env.S3_BUCKET || 'afagh-archive';
/** باکت اختصاصی پشتیبان/بازیابی — جدا از اسناد دانشجویان */
export const BACKUP_BUCKET = (process.env.MINIO_BACKUP_BUCKET || '').trim() || 'afagh-backup';
/** پیشوند کلید پشتیبان‌ها — یک منبع حقیقت برای نوشتن، فهرست‌کردن، هرس و مسیر دانلود */
export const BACKUP_KEY_PREFIX = 'afagh-backup/';

// ── بررسی وجود باکت (memoised در سطح پروسه) ──
// هدف: هیچ درخواست آپلودی دیگر `bucketExists`/`makeBucket` صدا نزند.
// نتیجهٔ مثبت تا پایان عمر پروسه کش می‌شود؛ نتیجهٔ منفی ۶۰ ثانیه بعد دوباره
// بررسی می‌شود تا اگر مدیر سامانه باکتِ گم‌شده را ساخت، اپ بدون restart برگردد.
const NEGATIVE_PROBE_TTL_MS = 60_000;

type BucketProbe = { exists: boolean; at: number } | Promise<boolean>;

function bucketProbes(): Map<string, BucketProbe> {
  return (g.__afaghBucketProbe ??= new Map<string, BucketProbe>());
}

/** آیا باکت وجود دارد؟ نتیجه memoised؛ هرگز باکت نمی‌سازد و هرگز throw نمی‌کند. */
export async function isBucketAvailable(bucket: string): Promise<boolean> {
  const probes = bucketProbes();
  const hit = probes.get(bucket);
  if (hit instanceof Promise) return hit;
  if (hit && (hit.exists || Date.now() - hit.at < NEGATIVE_PROBE_TTL_MS)) return hit.exists;

  const probe = S3.bucketExists(bucket).then(exists => exists === true).catch(() => false);
  probes.set(bucket, probe);
  const exists = await probe;
  probes.set(bucket, { exists, at: Date.now() });
  return exists;
}

/** خطای «باکت وجود ندارد» — مسیرهای API این را به پیام فارسی ۵۰۳ تبدیل می‌کنند. */
export class ObjectStoreBucketMissingError extends Error {
  readonly bucket: string;
  constructor(bucket: string) {
    super(`باکت «${bucket}» در فضای ذخیره‌سازی وجود ندارد یا در دسترس نیست.`);
    this.name = 'ObjectStoreBucketMissingError';
    this.bucket = bucket;
  }
}

/**
 * بررسی وجود باکت اسناد — بدون ساخت.
 * پیش‌تر این تابع در هر آپلود `bucketExists` و در صورت نبود `makeBucket` می‌زد؛
 * یعنی هر درخواست یک رفت‌وبرگشت اضافه به MinIO داشت و باکتِ حذف‌شده بی‌صدا
 * بازساخته می‌شد (پوشاندن خرابی زیرساخت). حالا فقط یک‌بار بررسی و در نبودِ باکت
 * خطای صریح داده می‌شود.
 */
export async function ensureBucket(bucket: string = ARCHIVE_BUCKET): Promise<void> {
  if (!(await isBucketAvailable(bucket))) throw new ObjectStoreBucketMissingError(bucket);
}

/**
 * ساختِ تنبلِ باکت پشتیبان — یک‌بار در هر پروسه (memoised promise).
 * پشتیبان‌گیری باید بدون دخالت دستی کار کند، ولی نه با هزینهٔ یک درخواست اضافه
 * به‌ازای هر آپلود. اگر ساخت شکست بخورد، promise پاک می‌شود تا تلاش بعدی دوباره
 * انجام شود (خطای گذرا کش نمی‌شود).
 */
export function ensureBackupBucket(): Promise<void> {
  if (g.__afaghBackupBucketReady) return g.__afaghBackupBucketReady;

  const ready = (async () => {
    if (await isBucketAvailable(BACKUP_BUCKET)) return;
    try {
      await S3.makeBucket(BACKUP_BUCKET, 'us-east-1');
    } catch (err) {
      // رقابت بین چند replica: «از قبل هست» خطا نیست.
      const code = String((err as { code?: unknown } | null)?.code ?? '');
      if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw err;
    }
    bucketProbes().set(BACKUP_BUCKET, { exists: true, at: Date.now() });
  })();

  g.__afaghBackupBucketReady = ready;
  ready.catch(() => {
    if (g.__afaghBackupBucketReady === ready) g.__afaghBackupBucketReady = undefined;
  });
  return ready;
}

// ── رمزنگاری در حالت استراحت (SSE-S3 / AES256) ──
// minio-js هدرهای `x-amz-*` را در متادیتای putObject دست‌نخورده پاس می‌دهد
// (helper.prependXAMZMeta) — همان معادل S3 `ServerSideEncryption: 'AES256'`.
const SSE_AES256_HEADER = 'x-amz-server-side-encryption';
const warnedSseBuckets = new Set<string>();

/** آیا خطا یعنی «سرور SSE را پشتیبانی نمی‌کند»؟ (فقط برای دقتِ پیام هشدار) */
export function isSseUnsupportedError(err: unknown): boolean {
  const code = String((err as { code?: unknown } | null)?.code ?? '').toLowerCase();
  if (code === 'notimplemented' || code === 'xnotimplemented' || code.includes('kms')) return true;
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return /not implemented|not supported|unsupported|kms|server.?side.?encryption|\bsse\b/.test(msg);
}

function warnSseUnsupported(bucket: string): void {
  if (warnedSseBuckets.has(bucket)) return;
  warnedSseBuckets.add(bucket);
  log.warn('object_store_sse_unsupported', {
    bucket,
    detail:
      'سرور Object Storage رمزنگاری SSE (AES256) را نپذیرفت؛ اشیا بدون رمزنگاری در همین باکت ذخیره می‌شوند. ' +
      'برای رمزنگاری در حالت استراحت، KMS/SSE را روی سرور فعال کنید — docs/minio-hardening.md',
  });
}

// ── کلاینت ──
const baseClient: Minio.Client = g.__afaghMinio ?? new Minio.Client({
  endPoint: process.env.S3_ENDPOINT || '127.0.0.1',
  port: Number(process.env.S3_PORT || 9000),
  useSSL: false,
  accessKey: s3Credentials.accessKey,
  secretKey: s3Credentials.secretKey,
});

/**
 * 🔁 سازگاری خواندنِ پشتیبان از مکان تازه.
 *
 * پشتیبان‌ها به باکت اختصاصی (BACKUP_BUCKET) منتقل شده‌اند، اما مسیر دانلود
 * `/api/admin/backup/download` (بیرون از دامنهٔ این تغییر) شیء را با
 * `ARCHIVE_BUCKET` می‌خواند. این پوستهٔ نازک همان خواندن را برای کلیدهای
 * `afagh-backup/` شفاف به باکت پشتیبان هدایت می‌کند و اگر شیء آنجا نبود، مکان
 * قدیمی (داخل باکت اسناد) را می‌خواند ⇒ دانلود و بازیابی بکاپ‌های موجود نمی‌شکند.
 * عمداً فقط getObject/statObject؛ بقیهٔ متدها بدون تغییر به کلاینت اصلی می‌رسند
 * (و همه با promise صدا زده می‌شوند، نه callback).
 */
function routedBuckets(bucket: string, key: unknown): string[] {
  if (bucket === ARCHIVE_BUCKET && typeof key === 'string' && key.startsWith(BACKUP_KEY_PREFIX)) {
    return [BACKUP_BUCKET, ARCHIVE_BUCKET]; // تازه ← قدیمی
  }
  return [bucket];
}

export const S3 = new Proxy(baseClient, {
  get(target, prop) {
    if (prop === 'getObject' || prop === 'statObject') {
      const method = prop;
      return async (bucket: string, key: string, ...rest: unknown[]): Promise<unknown> => {
        const candidates = routedBuckets(bucket, key);
        const call = (target as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[method];
        let lastErr: unknown;
        for (const candidate of candidates) {
          try {
            return await call.apply(target, [candidate, key, ...rest]);
          } catch (err) {
            lastErr = err;
          }
        }
        throw lastErr;
      };
    }
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  },
}) as Minio.Client;
// کلاینت خام (نه Proxy) کش می‌شود تا در dev/HMR لایه‌های Proxy روی هم سوار نشوند.
if (process.env.NODE_ENV !== 'production') g.__afaghMinio = baseClient;

/** ذخیرهٔ فایل در باکت بایگانی — کلید: archive/{studentId}/{typeId}-{timestamp}-{rand} */
export async function putArchiveObject(key: string, data: Buffer, contentType: string): Promise<{ size: number; etag: string }> {
  // باکت ساخته نمی‌شود؛ اگر نبود خطای صریح (پیام فارسی) بالا می‌رود.
  await ensureBucket();
  const plainMeta = { 'Content-Type': contentType };
  let etag = '';
  try {
    const info = await S3.putObject(ARCHIVE_BUCKET, key, data, data.length, {
      ...plainMeta,
      [SSE_AES256_HEADER]: 'AES256',
    });
    etag = String(info.etag ?? '');
  } catch (err) {
    // اسناد: نوشتن با SSE را یک بار بدون رمزنگاری تکرار می‌کنیم. اگر سرور SSE را
    // تبلیغ نکند، هشدار «پشتیبانی نمی‌شود» ثبت می‌شود؛ خطای دیگر هم یک بار
    // تلاش مجدد می‌گیرد و اگر باز هم شکست بخورد، همان خطای واقعی بالا می‌رود
    // ⇒ آپلود هرگز بی‌صدا موفق گزارش نمی‌شود.
    if (isSseUnsupportedError(err)) warnSseUnsupported(ARCHIVE_BUCKET);
    else {
      log.warn('object_store_sse_put_retry', {
        bucket: ARCHIVE_BUCKET,
        detail: 'نوشتن با رمزنگاری SSE شکست خورد؛ یک بار بدون رمزنگاری تکرار می‌شود.',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const info = await S3.putObject(ARCHIVE_BUCKET, key, data, data.length, plainMeta);
    etag = String(info.etag ?? '');
  }
  return { size: data.length, etag };
}

/** لینک امضاشدهٔ موقت (پیش‌فرض ۵ دقیقه) — فایل از Object Storage سرو می‌شود، نه از اپ */
export async function presignGet(key: string, expirySeconds = 300): Promise<string> {
  return S3.presignedGetObject(ARCHIVE_BUCKET, key, expirySeconds);
}

export async function removeArchiveObject(key: string): Promise<void> {
  await S3.removeObject(ARCHIVE_BUCKET, key);
}

export function archiveKey(studentId: number, typeId: number, ext: string): string {
  return `archive/${studentId}/${typeId}-${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
}

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
