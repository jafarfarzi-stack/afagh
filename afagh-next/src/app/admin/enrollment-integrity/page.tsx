import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity, isRealUniversityId } from '@/lib/university-scope';
import {
  countDrift,
  duplicateSummary,
  loadDuplicateGroups,
  loadOfferingDrift,
} from '@/lib/enrollment-count';
import IntegrityClient from './IntegrityClient';

export const dynamic = 'force-dynamic';

/**
 * «سلامت ثبت‌نام‌ها» — یک تابلوی عیب‌یابی و اصلاح:
 *  ۱) ناهمگامیِ شمارندهٔ صندلی (`enrolledCount` در برابر تعریفِ یکتا)،
 *  ۲) گروه‌های تکراری (student, term, course) با ردیف‌های فعالِ متعدد.
 *
 * همهٔ اعداد از SQL می‌آیند و دامنه همیشه «همین دانشگاه» است؛ نبودِ دانشگاهِ
 * معتبر ⇒ صفحه هیچ داده‌ای نشان نمی‌دهد (fail-closed).
 */
export default async function EnrollmentIntegrityPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni || !isRealUniversityId(uni.id)) {
    return (
      <div className="p-6 text-sm text-rose-700">
        دانشگاه فعال مشخص نیست؛ برای دیدن این تابلو ابتدا دانشگاه خود را انتخاب کنید.
      </div>
    );
  }

  // پیشفرض: «ترم جاری» — اسکنِ ۶۷ هزار ارائهٔ کل دانشگاه ۳ ثانیه طول میکشید.
  const cur = await db.execute<{ id: number; termCode: string | null }>(sql`
    SELECT id, "termCode" FROM academic_terms
     WHERE "universityId" = ${uni.id} AND "isCurrent" = 1
     ORDER BY id DESC LIMIT 1
  `).catch(() => ({ rows: [] as Array<{ id: number; termCode: string | null }> }));
  const currentTermRow = (cur?.rows ?? [])[0];
  const currentTermId = currentTermRow ? Number(currentTermRow.id) : null;

  const [drift, dup, driftRows, dupGroups] = await Promise.all([
    countDrift(uni.id, currentTermId).catch(() => ({ offerings: 0, totalDrift: 0, samples: [] })),
    duplicateSummary(uni.id).catch(() => ({ groups: 0, extraRows: 0 })),
    loadOfferingDrift(uni.id, 100, currentTermId).catch(() => []),
    loadDuplicateGroups(uni.id, 100).catch(() => []),
  ]);

  let terms: { id: number; termCode: string }[] = [];
  try {
    const termsRes = await db.execute<{ id: number; termCode: string | null }>(sql`
      SELECT id, "termCode" AS "termCode"
        FROM academic_terms
       WHERE "universityId" = ${uni.id}
       ORDER BY "termCode" DESC
       LIMIT 60
    `);
    terms = (termsRes.rows ?? []).map(r => ({
      id: Number(r.id),
      termCode: String(r.termCode ?? r.id),
    }));
  } catch {
    terms = [];
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 p-4 md:p-6">
      <IntegrityClient
        universityName={uni.title || '—'}
        scopeTermCode={currentTermRow?.termCode ? String(currentTermRow.termCode) : null}
        kpi={{
          driftOfferings: drift.offerings,
          totalDrift: drift.totalDrift,
          duplicateGroups: dup.groups,
          extraRows: dup.extraRows,
        }}
        drift={driftRows}
        duplicates={dupGroups}
        terms={terms}
      />
    </div>
  );
}
