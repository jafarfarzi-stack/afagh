import 'server-only';
import { db } from '@/db';
import { universities } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { uniTheme, type UniTheme } from './university-theme';

/**
 * ادغامِ برندِ ذخیره‌شدهٔ دانشگاه روی تمِ پیش‌فرض.
 * فقط کلیدهای معتبر و رشته‌ای را می‌پذیرد؛ هر مقدارِ نامعتبر/ناموجود → همان تمِ پیش‌فرض.
 */
export function mergeBrand(base: UniTheme, brandJson: unknown): UniTheme {
  if (!brandJson || typeof brandJson !== 'object' || Array.isArray(brandJson)) return base;
  const b = brandJson as Record<string, unknown>;
  const out: Record<string, string> = { ...base };
  for (const k of Object.keys(base)) {
    if (typeof b[k] === 'string') out[k] = b[k] as string;
  }
  return out as UniTheme;
}

/** نسخهٔ آگاه‌به‌دیتابیس از uniTheme — برندِ دانشگاه را از جدول می‌خواند.
 *  در صورت خطا یا نبود برند، به تمِ سخت‌کد بازمی‌گردد (fail-safe). */
export async function uniThemeResolved(code: string): Promise<UniTheme> {
  const base = uniTheme(code);
  try {
    const rows = await db
      .select({ brandJson: universities.brandJson })
      .from(universities)
      .where(eq(universities.code, String(code || '').toUpperCase()))
      .limit(1);
    return mergeBrand(base, rows[0]?.brandJson);
  } catch {
    return base;
  }
}
