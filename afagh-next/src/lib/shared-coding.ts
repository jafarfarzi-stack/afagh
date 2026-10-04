import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { geo_cities, geo_provinces, ministry_shared_codes } from '@/db/schema';

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

/**
 * نگاشت گزینه‌های سما «وضعیت نظام وظیفه» (۱۸ گزینهٔ عملیاتی پرونده) به کد
 * وزارت — فقط موارد قطعی. نامشخص‌ها null می‌مانند تا کد غلط به ثمین نرود.
 */
const MILITARY_SAMA_TO_MINISTRY: Record<string, string> = {
  'خانم است و وضعیت نظام وظیفه ندارد': '780004',
  'مشمول است و دفترچه دارد': '2',
  'مشمول است ولی دفترچه ندارد': '2',
  'معافیت تحصیلی فعال': '780005',
  'کارکنان متعهد خدمت ارگان‌ها': '780006',
  'کارت پایان خدمت': '780001',
};

export function mapMilitarySamaToMinistry(status: string | null | undefined): string | null {
  const s = String(status ?? '').trim();
  if (!s) return null;
  return MILITARY_SAMA_TO_MINISTRY[s] ?? null;
}

export type ResolvedCity = { cityCode: string; provinceCode: string };

/** کد وزارت شهر (۶ رقمی) → کدهای وزارت (شهر + استان) */
export async function resolveCityMinistryByCode(code: string | null | undefined): Promise<ResolvedCity | null> {
  const c = String(code ?? '').trim();
  if (!c) return null;
  const rows = await db
    .select({
      cityCode: geo_cities.ministryCode,
      provinceCode: geo_provinces.ministryCode,
    })
    .from(geo_cities)
    .innerJoin(geo_provinces, eq(geo_provinces.code, geo_cities.provinceCode))
    .where(eq(geo_cities.ministryCode, c))
    .limit(2);
  const valid = rows.filter(r => r.cityCode && r.provinceCode);
  if (valid.length !== 1 || !valid[0]?.cityCode || !valid[0]?.provinceCode) return null;
  return { cityCode: valid[0].cityCode, provinceCode: valid[0].provinceCode };
}

/**
 * عنوان شهر (مثل «خوی») → کدهای وزارت (شهر + استان).
 * فقط وقتی برمی‌گردد که دقیقاً یک کد متمایز بخورد (نقده با دو کد → null).
 */
export async function resolveCityMinistry(title: string | null | undefined): Promise<ResolvedCity | null> {
  const t = normalizeFaTitle(title);
  if (!t) return null;
  const rows = await db
    .select({
      title: geo_cities.title,
      cityCode: geo_cities.ministryCode,
      provinceCode: geo_provinces.ministryCode,
    })
    .from(geo_cities)
    .innerJoin(geo_provinces, eq(geo_provinces.code, geo_cities.provinceCode));
  const matched = rows.filter(
    r => r.cityCode && r.provinceCode && normalizeFaTitle(r.title) === t,
  );
  const codes = new Set(matched.map(r => `${r.provinceCode}::${r.cityCode}`));
  if (codes.size !== 1 || !matched[0]?.cityCode || !matched[0]?.provinceCode) return null;
  return { cityCode: matched[0].cityCode, provinceCode: matched[0].provinceCode };
}

function normalizeFaTitle(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}
