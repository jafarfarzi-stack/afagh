import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { degree_level_configs, departments, educational_regulations, faculties, legacy_code_maps, majors, roles, staff, students, universities, user_roles, users } from '@/db/schema';
import type { RegulationPick } from './types';
import { requireRole } from '@/lib/auth';
import { normalizeFa, normCol } from '@/lib/persian-search';
import { getSetting } from '@/lib/settings';
import StudentsManagerClient from './StudentsManagerClient';

export const dynamic = 'force-dynamic';

const PER_PAGE = 50;

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; degree?: string; sort?: string; f_code?: string; f_name?: string; f_nc?: string; f_major?: string; f_year?: string; university?: string }>;
}) {
  const user = await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER', 'GRADUATEAFFAIRS']);
  const canEditGrades = user.roles.some(r => r === 'ADMIN' || r === 'GRADUATEAFFAIRS');
  const sp = await searchParams;

  // ── فهرست دانشگاه‌ها ──
  let allUniversities: { id: number; code: string; title: string; kind: string }[] = [];
  try {
    allUniversities = await db.select().from(universities).where(eq(universities.isActive, 1)).orderBy(universities.id);
  } catch { /* جدول universities ممکن است هنوز ساخته نشده باشد */ }
  const universityParam = (sp.university || '').trim();
  const currentUniversity = universityParam && !universityParam.startsWith('_')
    ? allUniversities.find(u => u.code === universityParam) ?? allUniversities[0]
    : allUniversities[0];
  const currentUniversityId = currentUniversity?.id ?? null;

  const q = (sp.q || '').trim().slice(0, 60);
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const statusFilter = (sp.status || 'ALL').toUpperCase();
  const degreeFilter = parseInt(sp.degree || '0', 10) || 0;
  const sortRaw = (sp.sort || '').trim();
  const fCode = (sp.f_code || '').trim().slice(0, 20);
  const fName = (sp.f_name || '').trim().slice(0, 60);
  const fNc = (sp.f_nc || '').trim().slice(0, 20);
  const fMajor = (sp.f_major || '').trim().slice(0, 60);
  const fYear = (sp.f_year || '').trim().slice(0, 4);

  // ── فیلترهای مشترک ──
  const conds = [];
  if (currentUniversityId) conds.push(or(eq(students.universityId, currentUniversityId), isNull(students.universityId))!);
  if (statusFilter !== 'ALL') conds.push(eq(students.status, statusFilter));
  if (degreeFilter > 0) conds.push(eq(students.degreeLevelId, degreeFilter));
  if (q) {
    const like = `%${q}%`;
    const faLike = `%${normalizeFa(q)}%`;
    conds.push(
      or(
        ilike(students.studentCode, like),
        ilike(users.nationalCode, like),
        ilike(normCol(users.firstName), faLike),
        ilike(normCol(users.lastName), faLike),
      )!,
    );
  }
  if (fCode) conds.push(ilike(students.studentCode, `%${fCode}%`));
  if (fName) {
    const faLike = `%${normalizeFa(fName)}%`;
    conds.push(or(ilike(normCol(users.firstName), faLike), ilike(normCol(users.lastName), faLike))!);
  }
  if (fNc) conds.push(ilike(users.nationalCode, `%${fNc}%`));
  if (fMajor) conds.push(ilike(normCol(majors.name), `%${normalizeFa(fMajor)}%`));
  if (/^\d{4}$/.test(fYear)) conds.push(eq(students.entryYear, Number(fYear)));
  const where = conds.length ? and(...conds) : undefined;

  // ── مرتب‌سازی ستونی (پیش‌فرض: جدیدترین) ──
  const SORTABLE: Record<string, 'studentCode' | 'name' | 'nc' | 'major' | 'degree' | 'year' | 'status'> = {
    studentCode: 'studentCode', name: 'name', nc: 'nc', major: 'major', degree: 'degree', year: 'year', status: 'status',
  };
  const [sortKeyRaw, sortDirRaw] = sortRaw.split(':');
  const sortKey = SORTABLE[sortKeyRaw] ?? null;
  const sortDir = sortDirRaw === 'desc' ? 'desc' : 'asc';
  const orderBy = !sortKey
    ? [desc(students.id)]
    : sortKey === 'studentCode' ? (sortDir === 'asc' ? [students.studentCode] : [desc(students.studentCode)])
    : sortKey === 'name' ? (sortDir === 'asc' ? [users.lastName, users.firstName] : [desc(users.lastName), desc(users.firstName)])
    : sortKey === 'nc' ? (sortDir === 'asc' ? [users.nationalCode] : [desc(users.nationalCode)])
    : sortKey === 'major' ? (sortDir === 'asc' ? [majors.name] : [desc(majors.name)])
    : sortKey === 'degree' ? (sortDir === 'asc' ? [degree_level_configs.title] : [desc(degree_level_configs.title)])
    : sortKey === 'year' ? (sortDir === 'asc' ? [students.entryYear] : [desc(students.entryYear)])
    : (sortDir === 'asc' ? [students.status] : [desc(students.status)]);

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
      gender: users.gender,
      userIsActive: users.isActive,
      userId: users.id,
      placeOfBirth: users.placeOfBirth,
      placeOfIssue: users.placeOfIssue,
      nationality: users.nationality,
      photoKey: users.photoKey,
      firstNameEn: users.firstNameEn,
      lastNameEn: users.lastNameEn,
      passportNumber: users.passportNumber,
      email: users.email,
      postalCode: users.postalCode,
      address: users.address,
      // ── پروندهٔ تکمیلی سما ──
      advisorCode: students.advisorCode,
      documentStatus: students.documentStatus,
      scholarshipType: students.scholarshipType,
      militaryStatus: students.militaryStatus,
      militaryExemptionNo: students.militaryExemptionNo,
      studentCardStatus: students.studentCardStatus,
      archiveNo: students.archiveNo,
      parvandehNo: students.parvandehNo,
      dormName: students.dormName,
      dormRoom: students.dormRoom,
      hasDorm: students.hasDorm,
      guardianJobTitle: students.guardianJobTitle,
      guardianPhone: students.guardianPhone,
      guardianAddress: students.guardianAddress,
      guardianEmail: students.guardianEmail,
      diplomaType: students.diplomaType,
      diplomaPlace: students.diplomaPlace,
      diplomaYear: students.diplomaYear,
      diplomaGrade: students.diplomaGrade,
      pishdPlace: students.pishdPlace,
      pishdYear: students.pishdYear,
      pishdGrade: students.pishdGrade,
      tuitionType: students.tuitionType,
      tuitionPayer: students.tuitionPayer,
      englishExamType: students.englishExamType,
      englishScore: students.englishScore,
      insertDate: students.insertDate,
      insertTime: students.insertTime,
      certIssued3m: students.certIssued3m,
      documentDeficiency: students.documentDeficiency,
      unitsRemaining: students.unitsRemaining,
      eqSemesters: students.eqSemesters,
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
    ? await baseQuery.where(where as never).orderBy(...(orderBy as never[])).limit(PER_PAGE).offset((safePage - 1) * PER_PAGE)
    : await baseQuery.orderBy(...(orderBy as never[])).limit(PER_PAGE).offset((safePage - 1) * PER_PAGE);

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
      userId: users.id,
      userIsActive: users.isActive,
      phone: staff.phone,
      maritalStatus: staff.maritalStatus,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .leftJoin(departments, eq(departments.id, staff.departmentId))
    .leftJoin(faculties, eq(faculties.id, staff.facultyId))
    .where(currentUniversityId ? or(eq(staff.universityId, currentUniversityId), isNull(staff.universityId)) : undefined)
    .orderBy(desc(staff.id));

  const [head] = await db.select().from(roles).where(eq(roles.code, 'DEP_HEAD')).limit(1);
  const roleRows = await db.select({ id: roles.id, code: roles.code, title: roles.title, isSystem: roles.isSystem }).from(roles).orderBy(roles.id);
  const staffUserIds = staffRows.map(r => r.userId).filter(Number.isInteger);
  const urRows = staffUserIds.length ? await db.select().from(user_roles).where(inArray(user_roles.userId, staffUserIds)) : [];
  const staffUserRoleIds: Record<number, number[]> = {};
  for (const r of staffRows) if (r.userId) staffUserRoleIds[r.userId] = [];
  for (const ur of urRows) (staffUserRoleIds[ur.userId] ??= []).push(ur.roleId);

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
          gender: (s as unknown as { gender?: string | null }).gender ?? null,
          isActive: (s as unknown as { userIsActive?: number | null }).userIsActive ?? 1,
          userId: (s as unknown as { userId?: number | null }).userId ?? null,
          placeOfBirth: s.placeOfBirth || '—',
          placeOfIssue: s.placeOfIssue || '—',
          nationality: s.nationality || '120001',
          photoKey: s.photoKey,
          acceptanceType: s.acceptanceType,
          acceptanceAllocation: s.acceptanceAllocation,
          studyingMode: s.studyingMode,
          trainingMethod: s.trainingMethod,
          graduateDate: s.graduateDate,
          firstNameEn: s.firstNameEn || '—',
          lastNameEn: s.lastNameEn || '—',
          passportNumber: s.passportNumber || '—',
          email: s.email || null,
          postalCode: s.postalCode || null,
          address: s.address || null,
          advisorCode: s.advisorCode || null,
          documentStatus: s.documentStatus || null,
          scholarshipType: s.scholarshipType || null,
          militaryStatus: s.militaryStatus || null,
          militaryExemptionNo: s.militaryExemptionNo || null,
          studentCardStatus: s.studentCardStatus || null,
          archiveNo: s.archiveNo || null,
          parvandehNo: s.parvandehNo || null,
          dormName: s.dormName || null,
          dormRoom: s.dormRoom || null,
          hasDorm: s.hasDorm ?? null,
          guardianJobTitle: s.guardianJobTitle || null,
          guardianPhone: s.guardianPhone || null,
          guardianAddress: s.guardianAddress || null,
          guardianEmail: s.guardianEmail || null,
          diplomaType: s.diplomaType || null,
          diplomaPlace: s.diplomaPlace || null,
          diplomaYear: s.diplomaYear || null,
          diplomaGrade: s.diplomaGrade || null,
          pishdPlace: s.pishdPlace || null,
          pishdYear: s.pishdYear || null,
          pishdGrade: s.pishdGrade || null,
          tuitionType: s.tuitionType || null,
          tuitionPayer: s.tuitionPayer ?? null,
          englishExamType: s.englishExamType || null,
          englishScore: s.englishScore || null,
          insertDate: s.insertDate || null,
          insertTime: s.insertTime || null,
          certIssued3m: s.certIssued3m ?? null,
          documentDeficiency: s.documentDeficiency || null,
          unitsRemaining: s.unitsRemaining ?? null,
          eqSemesters: s.eqSemesters ?? null,
          facultyName: s.facultyName || '—',
          majorName: s.majorName || '—',
          majorCode: s.majorCode || '—',
          degreeLevel: s.degreeLevel || '—',
          degreeLevelId: s.degreeLevelId ?? 0,
          degreeCode: s.degreeCode || '—',
          regulationId: s.regulationId,
          regulationTitle: s.regulationTitle || '—',
          role: 'دانشجو',
        }))}
        pagination={{ total: Number(total), page: safePage, per: PER_PAGE, totalPages, q, status: statusFilter, degree: degreeFilter, sort: sortKey ? `${sortKey}:${sortDir}` : '', f_code: fCode, f_name: fName, f_nc: fNc, f_major: fMajor, f_year: fYear, university: currentUniversity?.code ?? 'AFAGH' }}
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
          userId: (st as unknown as { userId?: number | null }).userId ?? null,
          userIsActive: (st as unknown as { userIsActive?: number | null }).userIsActive ?? 1,
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
        canEditGrades={canEditGrades}
        rolesAll={roleRows}
        userRoleIds={staffUserRoleIds}
        universities={allUniversities.map(u => ({ id: u.id, code: u.code, title: u.title, kind: u.kind }))}
        currentUniversityCode={currentUniversity?.code ?? 'AFAGH'}
      />
    </div>
  );
}
