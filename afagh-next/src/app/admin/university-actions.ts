'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { universities } from '@/db/schema';
import { canActOnUniversity, UNIVERSITY_COOKIE } from '@/lib/university-scope';
import { requireRole } from '@/lib/auth';

const AREA_ROLES = [
  'ADMIN',
  'EDU_EXPERT',
  'ARCHIVE_EXPERT',
  'FINANCE_EXPERT',
  'FINANCE',
  'MILITARY_OFFICER',
  'VAULT_MANAGER',
  'DEP_HEAD',
  'VICE_EDU',
] as never[];

/**
 * تنظیم کوکی دانشگاه فعال.
 *
 * ⚠️ نکتهٔ امنیتی: کوکی «انتخاب» است نه «مجوز». پذیرش آن باید با همان
 * مرزی باشد که `getCurrentUniversity` می‌خواند، وگرنه کاربر می‌تواند کوکی را
 * دستکاری کند یا با این اکشن به دانشگاه دیگری سوییچ کند.
 * پس فقط مقصدی پذیرفته می‌شود که در `authorizedUniversityIds()` هست؛
 * «ADMIN معاف» و «دامنهٔ خالی = همه» (fail-open) حذف شد.
 */
export async function setUniversityCookie(code: string) {
  await requireRole(AREA_ROLES);
  const c = String(code || '').trim().slice(0, 20);
  if (!c) return;
  try {
    const hit = (await db.select({ id: universities.id, code: universities.code })
      .from(universities).where(eq(universities.code, c)).limit(1))[0];
    if (!hit) return;
    // مرز واحد: همان محاسبه‌ای که getCurrentUniversity بر پایهٔ آن تصمیم می‌گیرد
    if (!(await canActOnUniversity(hit.id))) {
      throw new Error('این دانشگاه در محدودهٔ دسترسی شما نیست.');
    }
    const secureMode = (process.env.AFAGH_COOKIE_SECURE ?? 'auto').toLowerCase();
    const secure = secureMode === 'true' ? true : secureMode === 'false' ? false : true; // production default: secure
    (await cookies()).set(UNIVERSITY_COOKIE, hit.code, {
      path: '/', maxAge: 365 * 24 * 3600, httpOnly: true, secure, sameSite: 'lax',
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'این دانشگاه در محدودهٔ دسترسی شما نیست.') throw e;
    /* DB در دسترس نیست — نادیده */
  }
}
