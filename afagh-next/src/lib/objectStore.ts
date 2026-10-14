import * as Minio from 'minio';
import { createHash, randomBytes } from 'crypto';
import {
  S3_DEV_DEFAULT_ACCESS_KEY,
  S3_DEV_DEFAULT_SECRET_KEY,
  checkObjectStoreCredentials,
} from '@/lib/secret-guard';

// ═══ Object Storage — سند §۲۴۳۸: «فایل‌ها خارج از DB؛ فقط URL در دیتابیس» ═══
// MinIO (سازگار با S3) — در پروداکشن همان کد به S3/Cloudine وصل می‌شود.
const g = globalThis as unknown as { __afaghMinio?: Minio.Client };

/**
 * کلیدهای اتصال Object Storage — fail-closed در پروداکشن.
 *
 * پیش‌تر `afagh` / `afagh-secret` (پیش‌فرض عمومیِ داکر-کامپوز) جای کلید واقعی
 * می‌نشست و `secret-guard` فقط `console.warn` می‌کرد ⇒ نصب ناامن در سکوت بالا
 * می‌آمد و بایگانی اسناد دانشجویان با رمز قابل حدس سرو می‌شد. حالا همان سیاستِ
 * رمز DB اعمال می‌شود: در production «تنظیم‌نشده» یا «برابر پیش‌فرض عمومی» یعنی
 * throw. توسعه/دمو همچنان پیش‌فرض‌ها را می‌گیرد (یا با `ALLOW_WEAK_SECRETS=1`).
 * در فاز build (`NEXT_PHASE`) ساخته نمی‌شود تا `next build` نشکند.
 */
function resolveS3Credentials(): { accessKey: string; secretKey: string } {
  const accessKey = (process.env.S3_ACCESS_KEY || process.env.MINIO_ROOT_USER || '').trim();
  const secretKey = (process.env.S3_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '').trim();
  const isProd = process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE;

  if (isProd) {
    const verdict = checkObjectStoreCredentials();
    if (!verdict.ok) {
      throw new Error(
        `[s3] 🔒 ${verdict.reason}\n` +
        '   این سرور با پیکربندی ناامن بالا نمی‌آید (سیاست پروداکشن).\n' +
        '   راهنما: make check-env   ·   فرار موقت توسعه/دمو: ALLOW_WEAK_SECRETS=1',
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
  };
}

const s3Credentials = resolveS3Credentials();

export const S3 = g.__afaghMinio ?? new Minio.Client({
  endPoint: process.env.S3_ENDPOINT || '127.0.0.1',
  port: Number(process.env.S3_PORT || 9000),
  useSSL: false,
  accessKey: s3Credentials.accessKey,
  secretKey: s3Credentials.secretKey,
});
if (process.env.NODE_ENV !== 'production') g.__afaghMinio = S3;

export const ARCHIVE_BUCKET = process.env.S3_BUCKET || 'afagh-archive';

export async function ensureBucket(): Promise<void> {
  const exists = await S3.bucketExists(ARCHIVE_BUCKET).catch(() => false);
  if (!exists) await S3.makeBucket(ARCHIVE_BUCKET, 'us-east-1');
}

/** ذخیرهٔ فایل در باکت بایگانی — کلید: archive/{studentId}/{typeId}-{timestamp}-{rand} */
export async function putArchiveObject(key: string, data: Buffer, contentType: string): Promise<{ size: number; etag: string }> {
  await ensureBucket();
  const info = await S3.putObject(ARCHIVE_BUCKET, key, data, data.length, { 'Content-Type': contentType });
  return { size: data.length, etag: String(info.etag ?? '') };
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
