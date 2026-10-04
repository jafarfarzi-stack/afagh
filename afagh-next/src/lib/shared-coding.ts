import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { ministry_shared_codes } from '@/db/schema';

/**
 * کدینگ مشترک وزارت — خواندن مرجع سیدشده در مهاجرت 0043.
 * دامنه‌ها: GENDER | MARITAL | RELIGION | ACADEMIC_RANK | STUDENT_STATUS | DEGREE
 */

export const SHARED_CODE_DOMAINS = [
  'GENDER',
  'MARITAL',
  'RELIGION',
  'ACADEMIC_RANK',
  'STUDENT_STATUS',
  'DEGREE',
] as const;

export type SharedCodeDomain = (typeof SHARED_CODE_DOMAINS)[number];

export type SharedCode = {
  domain: string;
  code: string;
  title: string;
  latinTitle: string | null;
  standardCode: string | null;
  ministryCode: string | null;
};

/** همهٔ رکوردهای یک دامنه — برای دراپ‌داون‌ها و نگاشت ثمین */
export async function getSharedCodes(domain: SharedCodeDomain): Promise<SharedCode[]> {
  return (await db
    .select()
    .from(ministry_shared_codes)
    .where(eq(ministry_shared_codes.domain, domain))
    .orderBy(asc(ministry_shared_codes.code))) as SharedCode[];
}

/** عنوان فارسی یک کد در دامنه */
export async function getSharedCodeTitle(domain: SharedCodeDomain, code: string | null | undefined): Promise<string | null> {
  const c = String(code ?? '').trim();
  if (!c) return null;
  const [row] = await db
    .select({ title: ministry_shared_codes.title })
    .from(ministry_shared_codes)
    .where(and(eq(ministry_shared_codes.domain, domain), eq(ministry_shared_codes.code, c)))
    .limit(1);
  return row?.title ?? null;
}
