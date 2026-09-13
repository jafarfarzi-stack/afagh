'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, educational_regulations, enrollments, legacy_code_maps, legacy_grades, roles, staff, student_term_states, students, user_roles, users } from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { hashPassword, requireRole } from '@/lib/auth';
import { getSessionUser } from '@/lib/auth';

/** پیکربندی اجرایی آیین‌نامه ملاک دانشجو برای محاسبات کارنامه */
export async function getTranscriptRegulation(studentId: number): Promise<{
  title: string | null;
  config: import('@/lib/regulations-engine').RegulationConfig;
} | null> {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER', 'GRADUATEAFFAIRS']);
  const { getRegulationConfig, DEFAULT_BACHELOR_REGULATION_1403 } = await import('@/lib/regulations-engine');
  const [stu] = await db
    .select({ regulationId: students.regulationId, degreeLevelId: students.degreeLevelId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!stu) return null;
  const [reg] = stu.regulationId
    ? await db.select({ title: educational_regulations.title }).from(educational_regulations).where(eq(educational_regulations.id, stu.regulationId)).limit(1)
    : [];
  const config = await getRegulationConfig(stu.regulationId, stu.degreeLevelId).catch(() => DEFAULT_BACHELOR_REGULATION_1403);
  return { title: reg?.title ?? null, config };
}

/** تغییر آیین‌نامه ملاک دانشجو (از پرونده یا مرکز آیین‌نامه‌ها) */
export async function setStudentRegulationAction(
  studentId: number, regulationId: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT', 'GRADUATEAFFAIRS']);
  } catch {
    return { ok: false, error: 'دسترسی لازم را ندارید.' };
  }
  if (!studentId || !regulationId) return { ok: false, error: 'دانشجو یا آیین‌نامه نامعتبر است.' };
  try {
    await db.update(students).set({ regulationId }).where(eq(students.id, studentId));
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'ثبت نشد.' };
  }
  revalidatePath('/admin/students');
  return { ok: true };
}

export type TranscriptRow = {
  enrollmentId?: number | null;
  offeringId?: number | null;
  termCode: string;
  termTitle: string | null;
  courseCode: string;
  courseTitle: string;
  units: string | null;
  courseType: string | null;
  gradeValue: string | null;
  gradeStatus: string;
  /** عین عنوان ستون «عنوان» فایل وضع نمره (از میز تطبیق GRADE_STATUS) */
  gradeStatusTitle: string | null;
  /** کد خام وضع نمره (markStat) یا samaGradeStatusCode — برای نمایش کوتاه در جدول + راهنمای کد در پایین کارنامه */
  gradeStatusCode: string | null;
  offeringType: string | null;
  /** وضعیت همان نیمسال (از وضعيت نيمسال دانشجويان) + مشروطی فایل */
  termStatusTitle: string | null;
  termProbation: boolean | null;
  /** آیین‌نامه اعمال‌شده روی این درس (فقط وقتی نمره مردودی حذف شده باشد) */
  _excludedByRegulation?: string;
};

/** نقشه کد عددی وضع نمره → عین عنوان فایل مرجع */
async function gradeStatusTitleMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await db
      .select({ code: legacy_code_maps.legacyCode, title: legacy_code_maps.legacyTitle })
      .from(legacy_code_maps)
      .where(eq(legacy_code_maps.domain, 'GRADE_STATUS'));
    for (const r of rows) {
      if (r.code && r.title && !map.has(r.code)) map.set(r.code, r.title);
    }
  } catch { /* میز تطبیق خالی باشد، fallback اعمال می‌شود */ }
  return map;
}

function markStatOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const ms = String(j?.markStat ?? '').trim();
    return ms || null;
  } catch { return null; }
}

export async function getTranscript(studentId: number): Promise<TranscriptRow[]> {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER', 'GRADUATEAFFAIRS']);
  const [stu] = await db.select({ id: students.id, code: students.studentCode }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) return [];
  const titleMap = await gradeStatusTitleMap();
  // وضعیت نیمسال‌ها (عنوان + مشروطی فایل) — یک کوئری برای همه ترم‌ها
  const termStates = new Map<string, { title: string | null; probation: boolean | null }>();
  try {
    const stRows = await db
      .select({ termCode: student_term_states.termCode, title: student_term_states.statusTitle, probation: student_term_states.isProbation })
      .from(student_term_states)
      .where(eq(student_term_states.studentId, studentId));
    for (const r of stRows) {
      termStates.set(r.termCode, {
        title: r.title,
        probation: r.probation == null ? null : Number(r.probation) === 1,
      });
    }
  } catch { /* جدول هنوز ساخته نشده باشد */ }
  const exactTitle = (markStat: string | null): string | null =>
    markStat ? titleMap.get(markStat) ?? null : null;
  // enrollments (سامانه جدید — از سما) + اتصال raw وضع نمره از legacy
  const ens = await db
    .select({
      enrollmentId: enrollments.id,
      offeringId: enrollments.offeringId,
      termCode: academic_terms.termCode,
      termTitle: academic_terms.title,
      courseCode: courses.code,
      courseTitle: courses.title,
      units: courses.units,
      courseType: courses.courseType,
      gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus,
      offeringType: course_offerings.offeringType,
      samaGradeStatusCode: enrollments.samaGradeStatusCode,
      legacyRaw: sql<string | null>`lg.raw`,
    })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .leftJoin(
      sql`legacy_grades lg`,
      sql`lg."studentCode" = ${stu.code} AND lg."termCode" = ${academic_terms.termCode} AND lg."courseCode" = ${courses.code}`,
    )
    .where(eq(enrollments.studentId, studentId))
    .orderBy(desc(academic_terms.termCode), courses.code);
  if (ens.length) {
    return ens.map(r => {
      const ts = termStates.get(r.termCode);
      const code = markStatOf(r.legacyRaw) ?? r.samaGradeStatusCode ?? null;
      return {
        enrollmentId: r.enrollmentId,
        offeringId: r.offeringId,
        termCode: r.termCode,
        termTitle: r.termTitle,
        courseCode: r.courseCode,
        courseTitle: r.courseTitle,
        units: r.units ? String(r.units) : null,
        courseType: r.courseType,
        gradeValue: r.gradeValue ? String(r.gradeValue) : null,
        gradeStatus: r.gradeStatus,
        gradeStatusTitle: exactTitle(code),
        gradeStatusCode: code,
        offeringType: r.offeringType,
        termStatusTitle: ts?.title ?? null,
        termProbation: ts?.probation ?? null,
      };
    });
  }
  // fallback: legacy_grades (اگر هنوز promote نشده)
  const legs = await db
    .select({
      termCode: legacy_grades.termCode,
      courseCode: legacy_grades.courseCode,
      courseTitle: legacy_grades.courseTitle,
      units: legacy_grades.units,
      gradeValue: legacy_grades.gradeValue,
      gradeStatus: legacy_grades.gradeStatus,
      raw: legacy_grades.raw,
    })
    .from(legacy_grades)
    .where(eq(legacy_grades.studentCode, stu.code))
    .orderBy(desc(legacy_grades.termCode), legacy_grades.courseCode)
    .limit(500);
  return legs.map(r => {
    const ts = termStates.get(r.termCode);
    const code = markStatOf(r.raw);
    return {
      enrollmentId: null,
      offeringId: null,
      termCode: r.termCode,
      termTitle: null,
      courseCode: r.courseCode,
      courseTitle: r.courseTitle || `درس ${r.courseCode}`,
      units: r.units ? String(r.units) : null,
      courseType: null,
      gradeValue: r.gradeValue ? String(r.gradeValue) : null,
      gradeStatus: r.gradeStatus,
      gradeStatusTitle: exactTitle(code),
      gradeStatusCode: code,
      offeringType: null,
      termStatusTitle: ts?.title ?? null,
      termProbation: ts?.probation ?? null,
    };
  });
}

/** فعال/غیرفعال‌سازی دسترسی وب کاربر (دانشجو / استاد / کاربر) — فقط ADMIN */
export async function setUserActiveAction(
  userId: number, active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, error: 'فقط مدیر سیستم (ADMIN) اجازه فعال/غیرفعال‌سازی کاربر را دارد.' };
  }
  if (!userId) return { ok: false, error: 'کاربر نامعتبر است.' };
  try {
    await db.update(users).set({ isActive: active ? 1 : 0 }).where(eq(users.id, userId));
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'ثبت نشد.' };
  }
  revalidatePath('/admin/students');
  return { ok: true };
}

/** مشخص کردن نقش‌های یک حساب بر اساس ردیف‌های دانشجوی/کارمند — ردیف‌های جاافتادهٔ user_roles ساخته می‌شوند */
async function ensureAccountRoles(userId: number): Promise<void> {
  const [stu] = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId)).limit(1);
  const [stf] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, userId)).limit(1);
  for (const code of [stu ? 'STUDENT' : null, stf ? 'PROFESSOR' : null].filter(Boolean) as string[]) {
    const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).limit(1);
    if (r) {
      await db.insert(user_roles).values({ userId, roleId: r.id })
        .onConflictDoNothing({ target: [user_roles.userId, user_roles.roleId] })
        .catch(() => {});
    }
  }
}

/** تغییر رمز عبور کاربر توسط مدیر (حداقل ۴ رقم/حرف) — فقط ADMIN */
export async function resetUserPasswordAction(
  userId: number, newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, error: 'فقط مدیر سیستم (ADMIN) اجازه تغییر رمز کاربران را دارد.' };
  }
  const pw = String(newPassword || '').trim();
  if (!userId) return { ok: false, error: 'کاربر نامعتبر است.' };
  if (pw.length < 4 || pw.length > 64) return { ok: false, error: 'رمز باید بین ۴ تا ۶۴ کاراکتر باشد.' };
  try {
    const passwordHash = await hashPassword(pw);
    await db.update(users).set({ passwordHash, mustChangePassword: 1 }).where(eq(users.id, userId));
    await ensureAccountRoles(userId);
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'ثبت نشد.' };
  }
  revalidatePath('/admin/students');
  return { ok: true };
}

/** بازنشانی گروهی رمز حساب‌های دانشجویان/اساتید (+ ساخت نقش‌های جاافتاده) — فقط ADMIN */
export async function bulkResetPasswordsAction(
  scope: 'student' | 'professor', newPassword: string,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, error: 'فقط مدیر سیستم (ADMIN) اجازه این عملیات را دارد.' };
  }
  const pw = String(newPassword || '').trim();
  if (pw.length < 4 || pw.length > 64) return { ok: false, error: 'رمز باید بین ۴ تا ۶۴ کاراکتر باشد.' };
  const scopeWhere = scope === 'professor'
    ? `EXISTS (SELECT 1 FROM staff st WHERE st."userId" = users.id)`
    : `EXISTS (SELECT 1 FROM students st WHERE st."userId" = users.id)`;
  const roleCode = scope === 'professor' ? 'PROFESSOR' : 'STUDENT';
  try {
    const hash = await hashPassword(pw);
    const upd = await db.execute(sql`
      UPDATE users SET "passwordHash" = ${hash}, "mustChangePassword" = 1
      WHERE "isActive" = 1 AND ${sql.raw(scopeWhere)}
    `);
    const count = Number((upd as any)?.rowCount ?? 0);
    // ساخت نقش برای حساب‌های گروهی که ردیف user_roles ندارند
    await db.execute(sql`
      INSERT INTO user_roles ("userId", "roleId")
      SELECT u.id, r.id FROM users u
      JOIN roles r ON r.code = ${roleCode}
      WHERE ${sql.raw(scopeWhere)}
        AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur."userId" = u.id AND ur."roleId" = r.id)
      ON CONFLICT ("userId", "roleId") DO NOTHING
    `);
    return { ok: true, count };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'انجام نشد.' };
  } finally {
    revalidatePath('/admin/students');
  }
}

/** بازسازی نقش‌های جاافتاده برای همهٔ حساب‌ها (دانشجو=STUDENT، کارمند=PROFESSOR) — فقط ADMIN */
export async function backfillRolesAction(): Promise<{ ok: boolean; error?: string; inserted?: number }> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, error: 'فقط مدیر سیستم (ADMIN) اجازه این عملیات را دارد.' };
  }
  try {
    let inserted = 0;
    for (const [code, srcTable] of [['STUDENT', 'students'], ['PROFESSOR', 'staff']] as const) {
      const ins = await db.execute(sql`
        INSERT INTO user_roles ("userId", "roleId")
        SELECT u.id, r.id FROM users u
        JOIN roles r ON r.code = ${code}
        WHERE ${sql.raw(`EXISTS (SELECT 1 FROM ${srcTable} st WHERE st."userId" = u.id)`)}
          AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur."userId" = u.id AND ur."roleId" = r.id)
        ON CONFLICT ("userId", "roleId") DO NOTHING
      `);
      inserted += Number((ins as any)?.rowCount ?? 0);
    }
    return { ok: true, inserted };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'انجام نشد.' };
  } finally {
    revalidatePath('/admin/students');
  }
}

/** ثبت حساب کاربری جدید «استاد/کارکن» (مثل کارشناس اداری یا همکار آموزشی) — فقط ADMIN */
export async function createStaffExpertAction(input: {
  nationalCode: string; firstName: string; lastName: string;
  fatherName?: string; birthCertNo?: string; gender?: string; mobile?: string;
  email?: string; staffCode?: string; staffType?: string;
}): Promise<{ ok: boolean; error?: string; userId?: number }> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, error: 'فقط مدیر سیستم (ADMIN) می‌تواند حساب ایجاد کند.' };
  }
  const nc = String(input.nationalCode || '').trim();
  const fn = String(input.firstName || '').trim();
  const ln = String(input.lastName || '').trim();
  const sc = String(input.staffCode || '').trim() || nc;
  if (!nc || !fn || !ln) return { ok: false, error: 'کد ملی، نام و نام خانوادگی الزامی است.' };
  if (!/^\d{10}$/.test(nc)) return { ok: false, error: 'کد ملی باید ۱۰ رقم باشد.' };
  try {
    const dupNc = await db.select({ id: users.id }).from(users).where(eq(users.nationalCode, nc)).limit(1);
    if (dupNc.length) return { ok: false, error: 'کاربری با این کد ملی از قبل وجود دارد.' };
    const dupSc = await db.select({ id: staff.id }).from(staff).where(eq(staff.staffCode, sc)).limit(1);
    if (dupSc.length) return { ok: false, error: 'کد پرسنلی تکراری است.' };
    const passwordHash = await hashPassword(nc); // ورود اولیه با کد ملی؛ اجباری به تغییر
    const [u] = await db.insert(users).values({
      nationalCode: nc, firstName: fn, lastName: ln,
      fatherName: String(input.fatherName || '').trim() || null,
      birthCertNo: String(input.birthCertNo || '').trim() || null,
      gender: String(input.gender || '').trim() || null,
      mobile: String(input.mobile || '').trim() || null,
      email: String(input.email || '').trim() || null,
      passwordHash, isActive: 1, mustChangePassword: 1,
    }).returning({ id: users.id });
    await db.insert(staff).values({
      userId: u.id, staffCode: sc,
      staffType: String(input.staffType || '').trim() || 'اداری',
    }).onConflictDoNothing();
    // اگر نوع سمت آموزشی است، همین‌جا نقش «استاد» را می‌دهیم تا بدون نقش نماند
    const stType = String(input.staffType || '').trim();
    if (stType.includes('هیئت') || stType.includes('مربی') || stType.includes('استاد')) {
      const [prof] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, 'PROFESSOR')).limit(1);
      if (prof) await db.insert(user_roles).values({ userId: u.id, roleId: prof.id }).onConflictDoNothing();
    }
    revalidatePath('/admin/students');
    revalidatePath('/admin/staff');
    return { ok: true, userId: u.id };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'ثبت نشد.' };
  }
}

/** تنظیم نقش‌های یک کاربر (کارشناس/استاد) — فقط ADMIN؛ از تب اساتید در پنل دانشجویان */
export async function saveUserRolesAction(userId: number, roleIds: number[]): Promise<{ ok: boolean; error?: string; added?: number; removed?: number }> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, error: 'فقط مدیر سیستم (ADMIN) می‌تواند نقش‌ها را تغییر دهد.' };
  }
  if (!userId || !Number.isInteger(userId)) return { ok: false, error: 'کاربر نامعتبر است.' };
  const me = await getSessionUser();
  const want = new Set(roleIds.map(Number).filter(Number.isInteger));
  const have = new Set((await db.select({ roleId: user_roles.roleId }).from(user_roles).where(eq(user_roles.userId, userId))).map(x => x.roleId));
  // 🔒 گارد قفل‌شدن: مدیر ارشد نباید نقش ADMIN خودش را بردارد
  if (want.size < have.size) {
    const [adm] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, 'ADMIN')).limit(1);
    if (adm && me?.id === userId && have.has(adm.id) && !want.has(adm.id)) {
      return { ok: false, error: 'نقش «مدیر ارشد» را نمی‌توان از خودتان برداشت (خطر قفل‌شدن سامانه).' };
    }
  }
  let added = 0;
  let removed = 0;
  for (const rid of [...want]) {
    if (!have.has(rid)) {
      await db.insert(user_roles).values({ userId, roleId: rid }).onConflictDoNothing().catch(() => {});
      added++;
    }
  }
  for (const rid of [...have]) {
    if (!want.has(rid)) {
      await db.delete(user_roles).where(and(eq(user_roles.userId, userId), eq(user_roles.roleId, rid)));
      removed++;
    }
  }
  revalidatePath('/admin/students');
  return { ok: true, added, removed };
}

/** فیلدهای قابل‌ذخیرهٔ پروندهٔ دانشجو (هم‌گام با تفاوت‌های types.ts) */
export type StudentProfilePatch = {
  fatherName?: string | null;
  birthCertNo?: string | null;
  placeOfBirth?: string | null;
  placeOfIssue?: string | null;
  gender?: string | null;
  mobile?: string | null;
  email?: string | null;
  postalCode?: string | null;
  address?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  advisorCode?: string | null;
  documentStatus?: string | null;
  scholarshipType?: string | null;
  militaryStatus?: string | null;
  militaryExemptionNo?: string | null;
  studentCardStatus?: string | null;
  archiveNo?: string | null;
  parvandehNo?: string | null;
  dormName?: string | null;
  dormRoom?: string | null;
  hasDorm?: number | null;
  guardianJobTitle?: string | null;
  guardianPhone?: string | null;
  guardianAddress?: string | null;
  guardianEmail?: string | null;
  diplomaType?: string | null;
  diplomaPlace?: string | null;
  diplomaYear?: string | null;
  diplomaGrade?: string | null;
  pishdPlace?: string | null;
  pishdYear?: string | null;
  pishdGrade?: string | null;
  tuitionType?: string | null;
  tuitionPayer?: number | null;
  englishExamType?: string | null;
  englishScore?: string | null;
  certIssued3m?: number | null;
  documentDeficiency?: string | null;
  unitsRemaining?: number | null;
  eqSemesters?: number | null;
};

/** ذخیرهٔ تغییرات پروندهٔ دانشجو (هویت + تکمیلی سما) توسط ادمین — فقط ADMIN */
export async function updateStudentProfileAction(
  studentId: number, patch: StudentProfilePatch,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(['ADMIN']);
  } catch {
    return { ok: false, error: 'فقط مدیر سیستم (ADMIN) اجازه ویرایش پروندهٔ دانشجو را دارد.' };
  }
  if (!studentId || !patch || typeof patch !== 'object') return { ok: false, error: 'شناسهٔ دانشجو یا مقادیر نامعتبر است.' };
  const clean = (v: unknown, max: number) => {
    if (v == null) return undefined;
    const s = String(v).trim();
    return s === '' ? null : s.slice(0, max);
  };
  const cleanNum = (v: unknown) => {
    if (v == null) return undefined;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const [row] = await db.select({ userId: students.userId }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!row) return { ok: false, error: 'دانشجو یافت نشد.' };
  try {
    const userSet: Record<string, unknown> = {};
    const us = [
      ['fatherName', 100], ['birthCertNo', 20], ['placeOfBirth', 150], ['placeOfIssue', 150],
      ['gender', 10], ['mobile', 11], ['email', 150], ['postalCode', 10], ['address', 300],
      ['passportNumber', 20], ['nationality', 10],
    ] as const;
    for (const [k, max] of us) {
      if (k in patch) { const v = clean((patch as Record<string, unknown>)[k], max); if (v !== undefined) userSet[k] = v; }
    }
    if (Object.keys(userSet).length) {
      await db.update(users).set(userSet as never).where(eq(users.id, row.userId));
    }
    const stuSet: Record<string, unknown> = {};
    const ss = [
      'advisorCode', 'documentStatus', 'scholarshipType', 'militaryStatus', 'militaryExemptionNo',
      'studentCardStatus', 'archiveNo', 'parvandehNo', 'dormName', 'dormRoom', 'guardianJobTitle',
      'guardianPhone', 'guardianAddress', 'guardianEmail', 'diplomaType', 'diplomaPlace',
      'diplomaYear', 'diplomaGrade', 'pishdPlace', 'pishdYear', 'pishdGrade', 'tuitionType',
      'englishExamType', 'englishScore', 'documentDeficiency',
    ] as const;
    for (const k of ss) {
      if (k in patch) { const v = clean((patch as Record<string, unknown>)[k], 300); if (v !== undefined) stuSet[k] = v; }
    }
    const ns = ['hasDorm', 'tuitionPayer', 'certIssued3m', 'unitsRemaining', 'eqSemesters'] as const;
    for (const k of ns) {
      if (k in patch) { const v = cleanNum((patch as Record<string, unknown>)[k]); if (v !== undefined) stuSet[k] = v; }
    }
    if (Object.keys(stuSet).length) {
      await db.update(students).set(stuSet as never).where(eq(students.id, studentId));
    }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'ثبت نشد.' };
  }
  revalidatePath('/admin/students');
  return { ok: true };
}
