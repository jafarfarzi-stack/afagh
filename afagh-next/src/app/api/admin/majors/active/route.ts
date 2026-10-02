import { and, eq, isNull, or } from 'drizzle-orm';
import { majors, degree_level_configs } from '@/db/schema';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';

/**
 * گزینه‌های «رشتهٔ مقصد» برای فیلدهای select با optionsEndpoint.
 * خروجی عمداً هم {value,label} می‌دهد (قرارداد رندرر فرم پویا) و هم فیلدهای
 * خام، تا مصرف‌کننده‌های دیگر بتوانند کد/نام/مقطع را جدا بخوانند.
 */
export async function GET() {
  await requireRole(['STUDENT', 'ADMIN', 'EDU_EXPERT']);

  // دامنهٔ دانشگاه: ردیف‌های NULL هم «پایه» حساب می‌شوند تا نصب تک‌دانشگاهی
  // (که universityId آن‌ها NULL است) هیچ‌وقت لیست خالی برنگرداند.
  const uni = await getCurrentUniversity().catch(() => null);
  const uw = uni ? or(eq(majors.universityId, uni.id), isNull(majors.universityId)) : undefined;

  const rows = await db
    .select({
      id: majors.id,
      name: majors.name,
      code: majors.majorCode,
      degreeLevelId: majors.degreeLevelId,
      degreeTitle: degree_level_configs.title,
    })
    .from(majors)
    .innerJoin(degree_level_configs, eq(degree_level_configs.id, majors.degreeLevelId))
    .where(and(eq(majors.isActive, 1), uw))
    .orderBy(majors.name);

  return Response.json(
    rows.map(r => ({
      id: r.id,
      value: r.code || String(r.id),
      label: r.degreeTitle ? `${r.name} (${r.degreeTitle})` : r.name,
      name: r.name,
      code: r.code,
      degreeLevelId: r.degreeLevelId,
      degreeTitle: r.degreeTitle,
    })),
  );
}
