import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { universities, users } from '@/db/schema';
import { getSetting } from '@/lib/settings';
import { ARCHIVE_BUCKET, S3 } from '@/lib/objectStore';

/**
 * دارایی‌های نمایشیِ صفحات استعلام عمومی (کارت دانشجویی، کارنامه، کارت آزمون).
 *
 * چرا اینجا و نه در `/api/photo/[userId]`؟ آن مسیر نیازمند نشست است و صفحهٔ
 * استعلام عمداً بدون ورود کار می‌کند. بنابراین عکس را همان‌جا در سرور می‌خوانیم
 * و به‌شکل data-URL در HTML همان صفحهٔ تأییدشده با توکن می‌گذاریم؛ کلید شیء هرگز
 * بیرون نمی‌رود و عکس فقط برای دارندهٔ توکن معتبر قابل مشاهده است.
 */

const SAFE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']);
/** سقف حجم عکس برای درون‌گذاری — عکس بزرگ‌تر فقط نمایش داده نمی‌شود (خطا نیست) */
const MAX_PHOTO_BYTES = 2_500_000;

/** عکس دانشجو/شخص به‌صورت data-URL (یا null اگر عکسی ثبت نشده باشد). */
export const studentPhotoDataUrl = cache(async (userId: number | null | undefined): Promise<string | null> => {
  const id = Number(userId ?? 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const [u] = await db
      .select({ key: users.photoKey, mime: users.photoMime })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!u?.key) return null;
    // همان سخت‌گیریِ مسیر عکس: کلید نسبی و بدون پیمایش مسیر
    if (u.key.startsWith('/') || u.key.includes('..')) return null;

    const stream = await S3.getObject(ARCHIVE_BUCKET, u.key);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      total += buf.length;
      if (total > MAX_PHOTO_BYTES) return null;
      chunks.push(buf);
    }
    if (!chunks.length) return null;
    const mime = SAFE_MIME.has((u.mime ?? '').toLowerCase()) ? (u.mime as string) : 'image/jpeg';
    return `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`;
  } catch {
    return null;
  }
});

/** ارم و عنوان دانشگاه: ارم اختصاصی دانشگاه، وگرنه ارم سراسری تنظیمات. */
export const universityBrand = cache(async (
  universityId: number | null | undefined,
): Promise<{ title: string | null; code: string | null; logoUrl: string | null }> => {
  let title: string | null = null;
  let code: string | null = null;
  let logoUrl: string | null = null;

  const id = Number(universityId ?? 0);
  if (Number.isFinite(id) && id > 0) {
    try {
      const [u] = await db
        .select({ title: universities.title, code: universities.code, logoUrl: universities.logoUrl })
        .from(universities)
        .where(eq(universities.id, id))
        .limit(1);
      if (u) {
        title = u.title;
        code = u.code;
        logoUrl = u.logoUrl;
      }
    } catch { /* ارم اختیاری است — نبودِ آن صفحه را نمی‌شکند */ }
  }

  if (!logoUrl) {
    logoUrl = (await getSetting('UNIVERSITY_LOGO').catch(() => '')) || null;
  }
  return { title, code, logoUrl };
});
