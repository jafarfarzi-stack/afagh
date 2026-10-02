import { and, eq, isNull, or } from 'drizzle-orm';
import { academic_terms } from '@/db/schema';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';

/**
 * «ترم جاری» برای فیلدهای select با optionsEndpoint.
 * خروجی هم {value,label} می‌دهد (قرارداد رندرر فرم پویا) و هم فیلدهای خام.
 */
export async function GET() {
  await requireRole(['STUDENT', 'ADMIN', 'EDU_EXPERT']);

  // دامنهٔ دانشگاه: ردیف‌های NULL هم «پایه» حساب می‌شوند تا نصب تک‌دانشگاهی
  // (که universityId آن‌ها NULL است) هیچ‌وقت لیست خالی برنگرداند.
  const uni = await getCurrentUniversity().catch(() => null);
  const uw = uni
    ? or(eq(academic_terms.universityId, uni.id), isNull(academic_terms.universityId))
    : undefined;

  const rows = await db
    .select({
      id: academic_terms.id,
      code: academic_terms.termCode,
      title: academic_terms.title,
      termType: academic_terms.termType,
      academicYear: academic_terms.academicYear,
    })
    .from(academic_terms)
    .where(and(eq(academic_terms.isCurrent, 1), uw))
    .orderBy(academic_terms.id);

  return Response.json(
    rows.map(r => ({
      id: r.id,
      value: r.code || String(r.id),
      label: r.title ? `${r.title} (${r.code})` : r.code,
      code: r.code,
      title: r.title,
      termType: r.termType,
      academicYear: r.academicYear,
    })),
  );
}
