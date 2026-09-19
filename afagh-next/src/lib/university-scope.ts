import { cookies } from 'next/headers';
import { db } from '@/db';
import { universities } from '@/db/schema';
import { UNI_THEMES, uniTheme, uniDot } from './university-theme';
export { UNI_THEMES, uniTheme, uniDot };
export type { UniTheme } from './university-theme';

/** نام کوکی دانشگاه فعال — همهٔ صفحه‌های ادمین همین را می‌خوانند */
export const UNIVERSITY_COOKIE = 'afagh_uni';

export type UniScope = { id: number; code: string; title: string; kind: string };

/**
 * دانشگاه فعال کاربر: کوکی → اعتبارسنجی در DB → پیش‌فرض AFAGH.
 * کوکی دست‌کاری‌شده بی‌سروصدا نادیده گرفته می‌شود (fail-safe به AFAGH).
 */
export async function getCurrentUniversity(): Promise<UniScope> {
  let all: UniScope[] = [];
  try {
    all = (await db.select({
      id: universities.id, code: universities.code,
      title: universities.title, kind: universities.kind,
    }).from(universities).orderBy(universities.id)) as UniScope[];
  } catch { /* جدول هنوز ساخته نشده */ }
  if (!all.length) return { id: 1, code: 'AFAGH', title: 'دانشگاه آفاق', kind: 'OWN' };
  const want = (await cookies()).get(UNIVERSITY_COOKIE)?.value?.trim();
  const hit = want ? all.find(u => u.code === want) : undefined;
  return hit ?? all[0];
}

/** همهٔ دانشگاه‌ها برای سوییچر سربرگ */
export async function listUniversities(): Promise<UniScope[]> {
  try {
    return (await db.select({
      id: universities.id, code: universities.code,
      title: universities.title, kind: universities.kind,
    }).from(universities).orderBy(universities.id)) as UniScope[];
  } catch {
    return [{ id: 1, code: 'AFAGH', title: 'دانشگاه آفاق', kind: 'OWN' }];
  }
}
