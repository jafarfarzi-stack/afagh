import * as Minio from 'minio';
import { createHash, randomInt } from 'crypto';

// ═══ Object Storage — سند §۲۴۳۸: «فایل‌ها خارج از DB؛ فقط URL در دیتابیس» ═══
// MinIO (سازگار با S3) — در پروداکشن همان کد به S3/Cloudine وصل می‌شود.
const g = globalThis as unknown as { __afaghMinio?: Minio.Client };

export const S3 = g.__afaghMinio ?? new Minio.Client({
  endPoint: process.env.S3_ENDPOINT || '127.0.0.1',
  port: Number(process.env.S3_PORT || 9000),
  useSSL: false,
  accessKey: process.env.S3_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'afagh',
  secretKey: process.env.S3_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'afagh-secret',
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
  return `archive/${studentId}/${typeId}-${Date.now()}-${randomInt(100, 999)}.${ext}`;
}

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
