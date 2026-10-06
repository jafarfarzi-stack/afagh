import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';

/**
 * ترمِ جاریِ **یک دانشگاه مشخص**.
 *
 * چند دانشگاه می‌توانند هم‌زمان `isCurrent=1` داشته باشند؛ انتخابِ کورِ اولین ردیف
 * باعث می‌شود استادِ دانشگاه آفاق، ترمِ دانشگاه دیگری را ببیند (و کارتابل‌اش خالی شود).
 * برای همین همیشه `universityId` لازم است.
 */
export async function currentTermFor(universityId?: number | null) {
  const where = universityId
    ? and(eq(academic_terms.isCurrent, 1), eq(academic_terms.universityId, universityId))
    : eq(academic_terms.isCurrent, 1);
  const rows = await db
    .select()
    .from(academic_terms)
    .where(where)
    .orderBy(asc(academic_terms.id))
    .limit(1);
  return rows[0] ?? null;
}

/** همهٔ ترم‌های یک دانشگاه (برای انتخاب‌گرها) — مرتب‌شده از قدیمی به جدید */
export async function termsFor(universityId?: number | null) {
  const where = universityId ? eq(academic_terms.universityId, universityId) : undefined;
  return db.select().from(academic_terms).where(where).orderBy(asc(academic_terms.id));
}
