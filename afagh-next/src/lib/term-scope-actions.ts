'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import { TERM_COOKIE } from './term-scope';
import { getCurrentUniversity } from './university-scope';

export async function setTermCookie(termId: number | null, _universityId: number | null): Promise<void> {
  void _universityId;
  const store = await cookies();
  // دانشگاه فقط از کوکی معتبر سمت سرور خوانده می‌شود؛ آرگومان کلاینت نادیده گرفته می‌شود
  const uni = await getCurrentUniversity().catch(() => null);
  if (!termId || !uni) {
    store.delete(TERM_COOKIE);
    return;
  }
  const hit = (
    await db
      .select({ id: academic_terms.id })
      .from(academic_terms)
      .where(eq(academic_terms.id, termId))
      .limit(1)
  )[0];
  if (!hit) return;
  const owner = (
    await db
      .select({ universityId: academic_terms.universityId })
      .from(academic_terms)
      .where(eq(academic_terms.id, termId))
      .limit(1)
  )[0];
  if (!owner || Number(owner.universityId) !== Number(uni.id)) return;
  store.set(TERM_COOKIE, String(termId), {
    path: '/',
    maxAge: 365 * 24 * 3600,
    sameSite: 'lax',
  });
}
