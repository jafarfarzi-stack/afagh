'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { universities } from '@/db/schema';
import { UNIVERSITY_COOKIE } from '@/lib/university-scope';

/** تنظیم کوکی دانشگاه فعال — فقط کدهای موجود در DB پذیرفته می‌شود */
export async function setUniversityCookie(code: string) {
  const c = String(code || '').trim().slice(0, 20);
  if (!c) return;
  try {
    const hit = (await db.select({ code: universities.code })
      .from(universities).where(eq(universities.code, c)).limit(1))[0];
    if (!hit) return;
    (await cookies()).set(UNIVERSITY_COOKIE, hit.code, {
      path: '/', maxAge: 365 * 24 * 3600, sameSite: 'lax',
    });
  } catch { /* DB در دسترس نیست — نادیده */ }
}
