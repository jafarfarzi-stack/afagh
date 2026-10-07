import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import {
  TERM_COOKIE,
  listTermsForUniversity,
  pickEffectiveTerm,
  termContainsToday,
  type TermScope,
} from '@/lib/term-scope';

export { TERM_COOKIE, termContainsToday, listTermsForUniversity, pickEffectiveTerm };
export type { TermScope };

/**
 * ترمِ جاریِ **یک دانشگاه مشخص**.
 *
 * چند دانشگاه می‌توانند هم‌زمان `isCurrent=1` داشته باشند؛ انتخابِ کورِ اولین ردیف
 * باعث می‌شود استادِ دانشگاه آفاق، ترمِ دانشگاه دیگری را ببیند (و کارتابل‌اش خالی شود).
 * برای همین همیشه `universityId` لازم است.
 *
 * ترمِ جاری اکنون **تاریخ‌محور** است: ابتدا ترمی که `startDate <= امروز <= endDate`
 * دارد انتخاب می‌شود (در هم‌پوشانی، دیرترین `startDate` می‌برد) و پرچم `isCurrent`
 * فقط نقشِ پشتیبان دارد. پرچم دستی به‌تنهایی در پروداکشن کهنه شده بود
 * (مثلاً نیمسال دوم ۱۳۹۹‑۱۴۰۰ که سال‌هاست `isCurrent=1` مانده).
 *
 * اگر `universityId` داده نشود هیچ ترمی برگردانده نمی‌شود؛ بدون دانشگاه، دامنهٔ
 * ترم قابل تشخیص نیست و نشت ترمِ دانشگاه دیگر بدتر از نداشتن ترم است.
 */
export async function currentTermFor(
  universityId?: number | null,
  dataSource: {
    listTerms?: (universityId?: number | null) => Promise<TermScope[]>;
    loadTermRow?: (id: number, universityId?: number | null) => Promise<AcademicTermRow | undefined>;
  } = {},
) {
  const list = dataSource.listTerms ?? listTermsForUniversity;
  const loadRow = dataSource.loadTermRow ?? loadTermRowScoped;
  const terms = await list(universityId);
  const effectiveId = pickEffectiveTermId(terms);
  if (!effectiveId) return null;
  const row = await loadRow(effectiveId, universityId);
  if (!row) return null;
  if (universityId && row.universityId !== universityId) return null;
  return row;
}

async function loadTermRowScoped(id: number, universityId?: number | null): Promise<AcademicTermRow | undefined> {
  const rows = await db
    .select()
    .from(academic_terms)
    .where(and(eq(academic_terms.id, id), universityId ? eq(academic_terms.universityId, universityId) : undefined))
    .limit(1);
  return rows[0];
}

/** شناسهٔ ترمِ مؤثر (تاریخ‌محور) از میان ترم‌های یک دانشگاه — یا `null` */
export function pickEffectiveTermId(terms: TermScope[] | null | undefined, today?: Date): number | null {
  return pickEffectiveTerm(terms ?? [], today)?.id ?? null;
}

export const getTermsForUniversity = listTermsForUniversity;

export type AcademicTermRow = typeof academic_terms.$inferSelect;

/** همهٔ ترم‌های یک دانشگاه (برای انتخاب‌گرها) — مرتب‌شده از قدیمی به جدید */
export async function termsFor(universityId?: number | null) {
  const where = universityId ? eq(academic_terms.universityId, universityId) : undefined;
  return db.select().from(academic_terms).where(where).orderBy(asc(academic_terms.id));
}
