import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { departments, faculties, staff, user_roles, users } from '@/db/schema';
import { currentExpertFilters } from '@/lib/expert-scope';
import type { StaffItem } from './types';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  بارگذاری فهرست استادان/پرسنل — **تنبل (on-demand)**
 *
 *  چرا این ماژول جدا شد؟
 *    قبلاً صفحهٔ `/admin/students` این فهرست را در هر بار رندر، برای **همهٔ**
 *    استادان (≈۱۴۰۰ نفر × ۳۵ فیلد) می‌خواند و به کلاینت می‌فرستاد. نتیجه:
 *      • HTML/RSC صفحه ۱.۶۶MB (۱۷۰KB با gzip) — ۹۷٪ آن فقط لیست استادان،
 *      • رندر سمت سرور ۶۷۳ms،
 *      • کندی محسوس روی خطوط کم‌سرعت.
 *    حالا این تابع فقط وقتی صدا زده می‌شود که ادمین تب «استادان» را باز کند
 *    (اکشن `loadStaffListAction`)، و خروجی‌اش در حالت کلاینت کش می‌شود.
 *
 *  ⚠ امنیت: دامنهٔ دید (universityId + نقش‌ها) از نشست خوانده می‌شود و
 *     همیشه اعمال می‌گردد — همان قواعدی که پیش‌تر در خود صفحه بود.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** شرط‌های دامنهٔ کارشناس آموزش برای استادان (همان منطق قبلی صفحه). */
async function staffScopeConds(roles: string[]) {
  if (!roles.includes('EDU_EXPERT')) return [];
  const eff = await currentExpertFilters().catch(() => null);
  if (!eff) return [];
  if (eff.departmentIds) return [inArray(staff.departmentId, eff.departmentIds)];
  if (eff.facultyIds) return [inArray(staff.facultyId, eff.facultyIds)];
  return [];
}

export async function loadStaffBundle(opts: {
  universityId: number | null;
  roles: string[];
}): Promise<{ staffList: StaffItem[]; userRoleIds: Record<number, number[]> }> {
  const { universityId, roles } = opts;

  const staffRows = await db
    .select({
      id: staff.id,
      staffCode: staff.staffCode,
      staffType: staff.staffType,
      academicRank: staff.academicRank,
      academicBase: staff.academicBase,
      degree: staff.degree,
      cooperationType: staff.cooperationType,
      employmentType: staff.employmentType,
      personnelNo: staff.personnelNo,
      hireDate: staff.hireDate,
      bankAccountNo: staff.bankAccountNo,
      isActive: staff.isActive,
      fieldOfStudy: staff.fieldOfStudy,
      fieldMain: staff.fieldMain,
      lastDegreeUniversity: staff.lastDegreeUniversity,
      lastDegreeCountryCode: staff.lastDegreeCountryCode,
      departmentName: departments.name,
      departmentCode: departments.departmentCode,
      facultyName: faculties.name,
      facultyCode: faculties.facultyCode,
      nationalCode: users.nationalCode,
      firstName: users.firstName,
      lastName: users.lastName,
      mobile: users.mobile,
      birthDate: users.birthDate,
      address: users.address,
      email: users.email,
      userId: users.id,
      userIsActive: users.isActive,
      photoKey: users.photoKey,
      phone: staff.phone,
      maritalStatus: staff.maritalStatus,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .leftJoin(departments, eq(departments.id, staff.departmentId))
    .leftJoin(faculties, eq(faculties.id, staff.facultyId))
    .where(and(
      universityId ? eq(staff.universityId, universityId) : undefined,
      ...(await staffScopeConds(roles)),
    ))
    .orderBy(desc(staff.id));

  // نقش‌های کاربریِ استادان (برای نشان نقش در سربرگ دوسیه)
  const staffUserIds = staffRows.map(r => r.userId).filter(Number.isInteger);
  const urRows = staffUserIds.length
    ? await db.select().from(user_roles).where(inArray(user_roles.userId, staffUserIds))
    : [];
  const userRoleIds: Record<number, number[]> = {};
  for (const r of staffRows) if (r.userId) userRoleIds[r.userId] = [];
  for (const ur of urRows) (userRoleIds[ur.userId] ??= []).push(ur.roleId);

  const staffList: StaffItem[] = staffRows.map(st => ({
    id: st.id,
    staffCode: st.staffCode ?? '',
    nationalCode: st.nationalCode ?? '',
    firstName: st.firstName ?? '',
    lastName: st.lastName ?? '',
    mobile: st.mobile || '—',
    academicRank: st.academicRank || st.academicBase || '—',
    degree: st.degree || st.fieldOfStudy || '—',
    staffType: st.cooperationType || st.employmentType || st.staffType || '—',
    cooperationType: st.cooperationType,
    birthDate: st.birthDate instanceof Date
      ? st.birthDate.toISOString().slice(0, 10)
      : (st.birthDate ? String(st.birthDate).slice(0, 10) : null),
    userId: st.userId ?? null,
    userIsActive: st.userIsActive ?? 1,
    phone: st.phone,
    address: st.address,
    email: st.email,
    maritalStatus: st.maritalStatus,
    departmentName: st.departmentName || '—',
    departmentCode: st.departmentCode,
    facultyName: st.facultyName || '—',
    facultyCode: st.facultyCode,
    fieldOfStudy: st.fieldOfStudy,
    fieldMain: st.fieldMain,
    lastDegreeUniversity: st.lastDegreeUniversity,
    lastDegreeCountryCode: st.lastDegreeCountryCode,
    personnelNo: st.personnelNo,
    hireDate: st.hireDate,
    bankAccountNo: st.bankAccountNo,
    academicBase: st.academicBase,
    isActive: st.isActive == null ? 1 : st.isActive,
    photoKey: st.photoKey ?? null,
    role: 'استاد / هیئت علمی',
  }));

  return { staffList, userRoleIds };
}
