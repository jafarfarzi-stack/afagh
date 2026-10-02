import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { staff, users, departments } from '@/db/schema';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';

/**
 * فهرست «استادان راهنما» برای فیلدهای select با optionsEndpoint
 * (مهاجرت 0039: supervisorId / advisorId).
 *
 * قبلاً هر کارمند فعال برمی‌گشت؛ حالا فقط استادان. «استاد بودن» در این پایگاه
 * یک ستون واحد ندارد و سه نشانه دارد که با OR با هم سنجیده می‌شوند:
 *   ۱) مرتبهٔ علمی ثبت‌شده (مربی/استادیار/دانشیار/استاد تمام) ⇒ هیئت علمی
 *   ۲) staffType با یکی از مقدارهای شناخته‌شده (دیتابیس مخلوط فارسی/انگلیسی است:
 *      «هیئت علمی» در src/lib/auth.ts و 'PROFESSOR' در src/lib/migration/engine.ts)
 *   ۳) داشتن نقش PROFESSOR در user_roles/roles
 */
const PROFESSOR_STAFF_TYPES = ['PROFESSOR', 'هیئت علمی', 'هیات علمی', 'استاد'];

export async function GET() {
  await requireRole(['STUDENT', 'ADMIN', 'EDU_EXPERT', 'PROFESSOR']);

  // دامنهٔ دانشگاه: ردیف‌های NULL هم «پایه» حساب می‌شوند تا نصب تک‌دانشگاهی
  // (که universityId آن‌ها NULL است) هیچ‌وقت لیست خالی برنگرداند.
  const uni = await getCurrentUniversity().catch(() => null);
  const uw = uni ? or(eq(staff.universityId, uni.id), isNull(staff.universityId)) : undefined;

  const hasProfessorRole = sql`exists (
    select 1 from "user_roles" ur
    join "roles" r on r.id = ur."roleId"
    where ur."userId" = ${staff.userId} and r."code" = 'PROFESSOR'
  )`;

  const isProfessor = or(
    isNotNull(staff.academicRank),
    inArray(staff.staffType, PROFESSOR_STAFF_TYPES),
    hasProfessorRole,
  );

  const rows = await db
    .select({
      id: staff.id,
      userId: staff.userId,
      staffCode: staff.staffCode,
      firstName: users.firstName,
      lastName: users.lastName,
      rank: staff.academicRank,
      staffType: staff.staffType,
      departmentName: departments.name,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .leftJoin(departments, eq(departments.id, staff.departmentId))
    .where(and(eq(staff.isActive, 1), isProfessor, uw))
    .orderBy(users.lastName, users.firstName);

  return Response.json(
    rows.map(r => {
      const fullName = `${r.firstName || ''} ${r.lastName || ''}`.trim() || 'نامشخص';
      const suffix = [r.rank, r.departmentName].filter(Boolean).join(' — ');
      return {
        id: r.id,
        value: String(r.id),
        label: suffix ? `${fullName} (${suffix})` : fullName,
        userId: r.userId,
        staffCode: r.staffCode,
        name: r.firstName || '',
        family: r.lastName || '',
        rank: r.rank,
        staffType: r.staffType,
        department: r.departmentName,
      };
    }),
  );
}
