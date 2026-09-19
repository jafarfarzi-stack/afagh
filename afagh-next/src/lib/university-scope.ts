import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { universities } from '@/db/schema';

/** نام کوکی دانشگاه فعال — همهٔ صفحه‌های ادمین همین را می‌خوانند */
export const UNIVERSITY_COOKIE = 'afagh_uni';

/**
 * تم رنگی هر دانشگاه (کلاس‌های کامل Tailwind — داینامیک نسازید تا JIT حذفشان نکند).
 * AFAGH بنفش (فعلی) · ZARINE نارنجی · ALLAME سبز · SHAMS رز · NAZHAND فیروزه‌ای
 */
export const UNI_THEMES: Record<string, { header: string; badge: string; ring: string; soft: string }> = {
  AFAGH: {
    header: 'bg-indigo-950',
    badge: 'bg-indigo-700 hover:bg-indigo-600 border-indigo-500',
    ring: 'border-indigo-700/60',
    soft: 'bg-indigo-900/80 text-indigo-200',
  },
  ZARINE: {
    header: 'bg-orange-950',
    badge: 'bg-orange-700 hover:bg-orange-600 border-orange-500',
    ring: 'border-orange-700/60',
    soft: 'bg-orange-900/80 text-orange-200',
  },
  ALLAME: {
    header: 'bg-emerald-950',
    badge: 'bg-emerald-700 hover:bg-emerald-600 border-emerald-500',
    ring: 'border-emerald-700/60',
    soft: 'bg-emerald-900/80 text-emerald-200',
  },
  SHAMS: {
    header: 'bg-rose-950',
    badge: 'bg-rose-700 hover:bg-rose-600 border-rose-500',
    ring: 'border-rose-700/60',
    soft: 'bg-rose-900/80 text-rose-200',
  },
  NAZHAND: {
    header: 'bg-cyan-950',
    badge: 'bg-cyan-700 hover:bg-cyan-600 border-cyan-500',
    ring: 'border-cyan-700/60',
    soft: 'bg-cyan-900/80 text-cyan-200',
  },
};

export function uniTheme(code: string) {
  return UNI_THEMES[code] ?? UNI_THEMES.AFAGH;
}

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
