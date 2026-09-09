import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, departments, educational_regulations, faculties, legacy_code_maps, majors, staff, students, users } from '@/db/schema';
import type { RegulationPick } from './StudentsManagerClient';
import { requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import StudentsManagerClient from './StudentsManagerClient';

export const dynamic = 'force-dynamic';

const PER_PAGE = 50;

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; degree?: string }>;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER']);
  const sp = await searchParams;
  const q = (sp.q || '').trim().slice(0, 60);
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const statusFilter = (sp.status || 'ALL').toUpperCase();
  const degreeFilter = parseInt(sp.degree || '0', 10) || 0;

  // ── فیلترهای مشترک ──
  const conds = [];
  if (statusFilter !== 'ALL') conds.push(eq(students.status, statusFilter));
  if (degreeFilter > 0) conds.push(eq(students.degreeLevelId, degreeFilter));
  if (q) {
    const like = `%${q}%`;
    conds.push(
      or(
        ilike(students.studentCode, like),
        ilike(users.nationalCode, like),
        ilike(users.firstName, like),
        ilike(users.lastName, like),
      )!,
    );
  }
  const where = conds.length ? and(...conds) : undefined;

  // ── تعداد کل + یک صفحه (صفحه‌بندی سمت سرور — ۳۲هزار رکورد یکجا لود نمی‌شود) ──
  const baseQuery = db
    .select({
      id: students.id,
      studentCode: students.studentCode,
      entryYear: students.entryYear,
      entryTerm: students.entryTerm,
      status: students.status,
      samaStatusCode: students.samaStatusCode,
      quotaType: students.quotaType,
      currentTermNo: students.currentTermNo,
      nationalCode: users.nationalCode,
      firstName: users.firstName,
      lastName: users.lastName,
      mobile: users.mobile,
      fatherName: users.fatherName,
      birthCertNo: users.birthCertNo,
      birthDate: users.birthDate,
      placeOfBirth: users.placeOfBirth,
      placeOfIssue: users.placeOfIssue,
      nationality: users.nationality,
      photoKey: users.photoKey,
      acceptanceType: students.acceptanceType,
      acceptanceAllocation: students.acceptanceAllocation,
      studyingMode: students.studyingMode,
      trainingMethod: students.trainingMethod,
      graduateDate: students.graduateDate,
      facultyName: faculties.name,
      majorName: majors.name,
      majorCode: majors.majorCode,
      degreeLevel: degree_level_configs.title,
      degreeCode: degree_level_configs.code,
      degreeLevelId: degree_level_configs.id,
      regulationId: students.regulationId,
      regulationTitle: educational_regulations.title,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(majors, eq(majors.id, students.majorId))
    .leftJoin(faculties, eq(faculties.id, majors.facultyId))
    .leftJoin(degree_level_configs, eq(degree_level_configs.id, students.degreeLevelId))
    .leftJoin(educational_regulations, eq(educational_regulations.id, students.regulationId));

  const [{ n: total }] = await db
    .select({ n: count() })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(where as never);
  const totalPages = Math.max(1, Math.ceil(Number(total) / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const studentRows = where
    ? await baseQuery.where(where as never).orderBy(desc(students.id)).limit(PER_PAGE).offset((safePage - 1) * PER_PAGE)
    : await baseQuery.orderBy(desc(students.id)).limit(PER_PAGE).offset((safePage - 1) * PER_PAGE);

  // ── فهرست آیین‌نامه‌ها برای تغییر آیین‌نامه دانشجو در پرونده ──
  let regulationPicks: RegulationPick[] = [];
  try {
    const regs = await db
      .select({ id: educational_regulations.id, title: educational_regulations.title, degreeLevelId: educational_regulations.degreeLevelId })
      .from(educational_regulations)
      .orderBy(educational_regulations.effectiveFromYear, educational_regulations.id);
    regulationPicks = regs.map(r => ({ id: r.id, title: r.title, degreeLevelId: r.degreeLevelId }));
  } catch { /* جدول خالی */ }

  // ── گزینه‌های فیلتر: مقاطع + شمارش وضعیت‌ها ──
  const degrees = await db
    .select({ id: degree_level_configs.id, title: degree_level_configs.title })
    .from(degree_level_configs)
    .orderBy(degree_level_configs.id);
  const statusCounts = await db
    .select({ status: students.status, n: count() })
    .from(students)
    .groupBy(students.status)
    .orderBy(sql`${count()} DESC`);

  // ── برچسب کدهای سما (نحوه ورود/نوع دوره/سهمیه) از میز تطبیق برای کارنامه ──
  const codeMaps = await db
    .select({ domain: legacy_code_maps.domain, code: legacy_code_maps.legacyCode, target: legacy_code_maps.targetCode, title: legacy_code_maps.legacyTitle })
    .from(legacy_code_maps)
    .where(sql`${legacy_code_maps.domain} IN ('ACCEPT_TYPE','PERIOD_TYPE','QUOTA')`);
  const codeLabels: { accept: Record<string, string>; acceptByTarget: Record<string, string>; period: Record<string, string>; quota: Record<string, string> } = { accept: {}, acceptByTarget: {}, period: {}, quota: {} };
  for (const r of codeMaps) {
    if (!r.code || !r.title) continue;
    if (r.domain === 'ACCEPT_TYPE') {
      codeLabels.accept[r.code] = r.title;
      if (r.target) codeLabels.acceptByTarget[r.target] = r.title;
    }
    else if (r.domain === 'PERIOD_TYPE') codeLabels.period[r.code] = r.title;
    else if (r.domain === 'QUOTA') codeLabels.quota[r.code] = r.title;
  }

  // خواندن اساتید و پرسنل با رتبه علمی و مدرک — پایه و نوع همکاری از سما
  // گروه/دانشکده/رشته/دانشگاه مستقیم از دیتابیس (نه placeholder)
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
      phone: staff.phone,
      maritalStatus: staff.maritalStatus,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .leftJoin(departments, eq(departments.id, staff.departmentId))
    .leftJoin(faculties, eq(faculties.id, staff.facultyId))
    .orderBy(desc(staff.id));

  return (
    <div className="space-y-4">
      <div className="card !p-4 bg-white border-slate-300 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">🎓 سامانه جامع مدیریت پذیرش و پرونده تحصیلی/پرسنلی</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {Number(total).toLocaleString('fa-IR')} پرونده دانشجویی — جست‌وجو و صفحه‌بندی سمت سرور
          </p>
        </div>
      </div>

      <StudentsManagerClient
        logoUrl={await getSetting('UNIVERSITY_LOGO').catch(() => '')}
        codeLabels={codeLabels}
        regulations={regulationPicks}
        students={studentRows.map(s => ({
          id: s.id,
          studentCode: s.studentCode,
          nationalCode: s.nationalCode,
          firstName: s.firstName,
          lastName: s.lastName,
          mobile: s.mobile || '—',
          entryYear: s.entryYear,
          entryTerm: s.entryTerm || 1,
          status: s.status,
          samaStatusCode: s.samaStatusCode,
          quotaType: s.quotaType || 'NORMAL',
          currentTermNo: s.currentTermNo || 1,
          fatherName: s.fatherName || '—',
          birthCertNo: s.birthCertNo || '—',
          birthDate: s.birthDate instanceof Date ? s.birthDate.toISOString().slice(0, 10) : (s.birthDate ? String(s.birthDate).slice(0, 10) : null),
          placeOfBirth: s.placeOfBirth || '—',
          placeOfIssue: s.placeOfIssue || '—',
          nationality: s.nationality || '120001',
          photoKey: s.photoKey,
          acceptanceType: s.acceptanceType,
          acceptanceAllocation: s.acceptanceAllocation,
          studyingMode: s.studyingMode,
          trainingMethod: s.trainingMethod,
          graduateDate: s.graduateDate,
          facultyName: s.facultyName || '—',
          majorName: s.majorName || '—',
          majorCode: s.majorCode || '—',
          degreeLevel: s.degreeLevel || '—',
          degreeCode: s.degreeCode || '—',
          regulationId: s.regulationId,
          regulationTitle: s.regulationTitle || '—',
          role: 'دانشجو',
        }))}
        pagination={{ total: Number(total), page: safePage, per: PER_PAGE, totalPages, q, status: statusFilter, degree: degreeFilter }}
        degrees={degrees}
        statusCounts={statusCounts.map(r => ({ status: r.status, n: Number(r.n) }))}
        staffList={staffRows.map(st => ({
          id: st.id,
          staffCode: st.staffCode,
          nationalCode: st.nationalCode,
          firstName: st.firstName,
          lastName: st.lastName,
          mobile: st.mobile || '—',
          academicRank: st.academicRank || st.academicBase || '—',
          degree: st.degree || st.fieldOfStudy || '—',
          staffType: st.cooperationType || st.employmentType || st.staffType || '—',
          cooperationType: st.cooperationType,
          birthDate: st.birthDate instanceof Date ? st.birthDate.toISOString().slice(0, 10) : (st.birthDate ? String(st.birthDate).slice(0, 10) : null),
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
          role: 'استاد / هیئت علمی',
        }))}
      />
    </div>
  );
}
