/**
 * Server Actions ماژول نمرات ادمین/کارشناس فارغ‌التحصیلی
 *
 * ثبت/ویرایش نمره توسط ادمین یا کارشناس فارغ‌التحصیلی (بدون OTP استاد)
 * با audit log کامل + محاسبه کد وضعیت سما
 */
'use server';

import { and, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, educational_regulations, enrollments, grade_change_log, grade_unfinalize_requests, legacy_grades, offering_professors, roles, staff, students, user_roles, users } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import { logGradeChange } from '@/lib/grade-change-log';
import { resolveSamaGradeStatusCode, syncStudentCourseRegulations } from '@/lib/resolve-sama-code';
import { GRADE_STATUS_CODES, gradeStatusTitleOf } from '@/lib/grade-status-codes';
import { getCurrentUniversity, isRealUniversityId } from '@/lib/university-scope';

export interface AdminGradeState {
  ok: boolean;
  message?: string;
  error?: string;
}

function fail(err: unknown): AdminGradeState {
  return { ok: false, error: (err as Error)?.message || 'خطای ناشناختهٔ سرور.' };
}

async function resolveAdminUniversityId(universityId?: number): Promise<number> {
  const serverUni = await getCurrentUniversity();
  if (!isRealUniversityId(serverUni.id)) throw new Error('دانشگاه فعال نامشخص است.');
  if (universityId != null && universityId !== serverUni.id) throw new Error('دسترسی به دانشگاه دیگر مجاز نیست.');
  return serverUni.id;
}

/**
 * ثبت/ویرایش نمره توسط ادمین یا کارشناس فارغ‌التحصیلی
 */
export async function adminSetGradeAction(
  _prev: AdminGradeState,
  payload: {
    enrollmentId?: number | null;
    offeringId?: number | null;
    studentId: number;
    studentCode: string;
    termCode?: string | null;
    courseCode?: string | null;
    gradeValue: number | null;
    customSamaStatusCode?: string | null;
    reason: string;
  }
): Promise<AdminGradeState> {
  try {
    const user = await requireRole(['ADMIN', 'GRADUATEAFFAIRS']);
    // کارشناس آموزش: فقط اگر برای او «ویرایش نمره» فعال شده باشد (expert_scopes.canEditGrades)
    if (!user.roles.includes('ADMIN') && !user.roles.includes('GRADUATEAFFAIRS')) {
      const { expertCanEditGrades } = await import('@/lib/expert-scope');
      if (!(await expertCanEditGrades(user.id))) {
        return { ok: false, error: 'شما مجوز ویرایش نمره ندارید (فقط کارشناسانی که «ویرایش نمره» برایشان فعال شده).' };
      }
    }

    // 🔐 تأیید دومرحله‌ای: ثبت نمره فقط اگر رمز عبور در ۱۰ دقیقهٔ اخیر دوباره
    // تأیید شده باشد (کوکی step-up). کلاینت روی STEPUP_REQUIRED مودال رمز باز می‌کند.
    const { checkStepUpToken } = await import('@/lib/step-up');
    if (!(await checkStepUpToken(user.id, 'grades:edit'))) {
      return { ok: false, error: 'STEPUP_REQUIRED:برای ثبت نمره، ابتدا رمز عبور خود را تأیید کنید (تأیید دومرحله‌ای — ۱۰ دقیقه معتبر است).' };
    }

    // اعتبارسنجی
    if (payload.gradeValue !== null &&
        (!Number.isFinite(payload.gradeValue) || payload.gradeValue < 0 || payload.gradeValue > 20)) {
      return { ok: false, error: 'نمره باید بین ۰ تا ۲۰ باشد.' };
    }
    if (!payload.reason || payload.reason.trim().length < 3) {
      return { ok: false, error: 'دلیل تغییر الزامی است (حداقل ۳ نویسه).' };
    }
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni || !isRealUniversityId(uni.id)) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };
    const [stuRow] = await db.select({ universityId: students.universityId, status: students.status })
      .from(students).where(eq(students.id, payload.studentId)).limit(1);
    if (!stuRow) return { ok: false, error: 'دانشجو یافت نشد.' };
    if (stuRow.universityId !== null && stuRow.universityId !== uni.id) {
      return { ok: false, error: 'دانشجو متعلق به دانشگاه دیگری است.' };
    }
    // ⚠️ اخطار فارغ‌التحصیل/غیرفعال: تغییر نمره فقط با «شرط خاص» — دلیل کامل (≥۱۰ نویسه) و تأیید صریح
    if (stuRow.status && !['ACTIVE', 'PROBATION'].includes(stuRow.status)) {
      if (payload.reason.trim().length < 10) {
        return { ok: false, error: `دانشجو ${stuRow.status === 'GRADUATED' ? 'فارغ‌التحصیل' : 'غیرفعال'} است — تغییر نمره نیازمند دلیل کامل‌تر (≥۱۰ نویسه) و تأیید خاص است.` };
      }
    }
    const legacySource = (await import('@/app/admin/students/transcript-utils')).legacySourceCodeFor(uni.code);
    const refScope = (c: any) => or(eq(c, uni.id), isNull(c));

    const gradeStr = payload.gradeValue !== null ? String(Number(payload.gradeValue.toFixed(2))) : null;
    const role = user.roles.includes('ADMIN') ? 'ADMIN' as const : 'GRADUATEAFFAIRS' as const;

    let targetOfferingId = payload.offeringId ?? null;
    let existingEnrollment: {
      id: number;
      offeringId: number;
      gradeValue: string | null;
      gradeStatus: string;
      samaGradeStatusCode: string | null;
    } | null = null;

    if (payload.enrollmentId) {
      const [e] = await db
        .select({
          id: enrollments.id,
          offeringId: enrollments.offeringId,
          gradeValue: enrollments.gradeValue,
          gradeStatus: enrollments.gradeStatus,
          samaGradeStatusCode: enrollments.samaGradeStatusCode,
          universityId: enrollments.universityId,
          studentId: enrollments.studentId,
        })
        .from(enrollments)
        .where(eq(enrollments.id, payload.enrollmentId))
        .limit(1);
      if (e) {
        if (e.universityId !== null && e.universityId !== uni.id) {
          return { ok: false, error: 'ثبت‌نام متعلق به دانشگاه دیگری است.' };
        }
        if (Number(e.studentId) !== Number(payload.studentId)) {
          return { ok: false, error: 'ثبت‌نام متعلق به این دانشجو نیست.' };
        }
        existingEnrollment = e;
        targetOfferingId = e.offeringId;
      }
    }

    if (!existingEnrollment && targetOfferingId) {
      const [e] = await db
        .select({
          id: enrollments.id,
          offeringId: enrollments.offeringId,
          gradeValue: enrollments.gradeValue,
          gradeStatus: enrollments.gradeStatus,
          samaGradeStatusCode: enrollments.samaGradeStatusCode,
          universityId: enrollments.universityId,
        })
        .from(enrollments)
        .where(and(eq(enrollments.studentId, payload.studentId), eq(enrollments.offeringId, targetOfferingId)))
        .limit(1);
      if (e) {
        if (e.universityId !== null && e.universityId !== uni.id) {
          return { ok: false, error: 'ثبت‌نام متعلق به دانشگاه دیگری است.' };
        }
        existingEnrollment = e;
      } else {
        // ارائهٔ مستقیم بدون ثبت‌نام موجود — مالکیت دانشگاهی ارائه هم چک شود
        const [off] = await db.select({ universityId: course_offerings.universityId })
          .from(course_offerings).where(eq(course_offerings.id, targetOfferingId)).limit(1);
        if (!off) return { ok: false, error: 'ارائه یافت نشد.' };
        if (off.universityId !== null && off.universityId !== uni.id) {
          return { ok: false, error: 'ارائه متعلق به دانشگاه دیگری است.' };
        }
      }
    }

    // اگر ارائه پیدا نشد اما ترم و درس مشخص است، سعی در یافتن یا ساختن ارائه
    if (!targetOfferingId && payload.termCode && payload.courseCode) {
      const [c] = await db.select({ id: courses.id }).from(courses)
        .where(and(eq(courses.code, payload.courseCode), refScope(courses.universityId))).limit(1);
      const [t] = await db.select({ id: academic_terms.id }).from(academic_terms)
        .where(and(eq(academic_terms.termCode, payload.termCode), refScope(academic_terms.universityId))).limit(1);
      if (c && t) {
        let [off] = await db
          .select({ id: course_offerings.id })
          .from(course_offerings)
          .where(and(eq(course_offerings.termId, t.id), eq(course_offerings.courseId, c.id)))
          .limit(1);
        if (!off) {
          const [newOff] = await db
            .insert(course_offerings)
            .values({
              universityId: uni.id,
              termId: t.id,
              courseId: c.id,
              groupNumber: 1,
              capacity: 999,
              offeringType: 'TRANSFER',
            })
            .returning({ id: course_offerings.id });
          off = newOff;
        }
        if (off) {
          targetOfferingId = off.id;
          const [e] = await db
            .select({
              id: enrollments.id,
              offeringId: enrollments.offeringId,
              gradeValue: enrollments.gradeValue,
              gradeStatus: enrollments.gradeStatus,
              samaGradeStatusCode: enrollments.samaGradeStatusCode,
            })
            .from(enrollments)
            .where(and(eq(enrollments.studentId, payload.studentId), eq(enrollments.offeringId, off.id)))
            .limit(1);
          if (e) existingEnrollment = e;
        }
      }
    }

    if (!targetOfferingId) {
      return { ok: false, error: 'شناسه ارائه درس یا درس و ترم مربوطه یافت نشد.' };
    }

    // 🔒 قفل نمرهٔ نهایی‌شده: نوشتن روی ردیف FINALIZED فقط با درخواست
    //    بازگشاییِ تأییدشده (معاون آموزشی) مجاز است. پیش از این، این مسیر
    //    نمرهٔ قطعی را مستقیم بازنویسی می‌کرد و درخواست بازگشایی بی‌اثر بود.
    {
      const { assertGradeWriteAllowed } = await import('@/lib/grades/finalize-lock');
      const gate = await assertGradeWriteAllowed(targetOfferingId);
      if (!gate.ok) return { ok: false, error: gate.error! };
    }

    // 🔒 کد دستی سما فقط از فهرست شناخته‌شدهٔ grade-status-codes مجاز است؛
    // کد ناشناس (تزریق دلخواه) رد می‌شود. مسیر خودکار resolveSamaGradeStatusCode
    // دست‌نخورده می‌ماند (همان منطق آیین‌نامهٔ دانشجو + کدهای منجمد REGULATION_FROZEN_CODES).
    const rawCustomCode = payload.customSamaStatusCode?.trim() || null;
    if (rawCustomCode !== null && !GRADE_STATUS_CODES.some(g => g.code === rawCustomCode)) {
      return { ok: false, error: `کد وضعیت سما (${rawCustomCode}) در فهرست کدهای شناخته‌شده نیست؛ از فهرست معتبر انتخاب کنید.` };
    }

    // محاسبه کد وضعیت سما: اولویت با کد دستی تعیین‌شده توسط ادمین، در غیر اینصورت حل هوشمند از روی درس و آیین‌نامه
    const samaCode = rawCustomCode ||
      await resolveSamaGradeStatusCode(payload.studentId, targetOfferingId, payload.gradeValue, existingEnrollment?.samaGradeStatusCode ?? null);

    if (existingEnrollment) {
      await db
        .update(enrollments)
        .set({
          gradeValue: gradeStr,
          gradeStatus: 'FINALIZED',
          samaGradeStatusCode: samaCode,
        })
        .where(and(
          eq(enrollments.id, existingEnrollment.id),
          or(eq(enrollments.universityId, uni.id), isNull(enrollments.universityId)),
        ));

      await logGradeChange({
        enrollmentId: existingEnrollment.id,
        studentId: payload.studentId,
        offeringId: targetOfferingId,
        action: 'ADMIN_OVERRIDE',
        oldGradeValue: existingEnrollment.gradeValue,
        newGradeValue: gradeStr,
        oldGradeStatus: existingEnrollment.gradeStatus,
        newGradeStatus: 'FINALIZED',
        oldSamaStatusCode: existingEnrollment.samaGradeStatusCode,
        newSamaStatusCode: samaCode,
        reason: payload.reason.trim(),
        actorUserId: user.id,
        actorRole: role,
      });
    } else {
      const [newEnr] = await db
        .insert(enrollments)
        .values({
          universityId: uni.id,
          studentId: payload.studentId,
          offeringId: targetOfferingId,
          status: 'REGISTERED',
          gradeValue: gradeStr,
          gradeStatus: 'FINALIZED',
          samaGradeStatusCode: samaCode,
        })
        .returning({ id: enrollments.id });

      if (newEnr) {
        await logGradeChange({
          enrollmentId: newEnr.id,
          studentId: payload.studentId,
          offeringId: targetOfferingId,
          action: 'ADMIN_OVERRIDE',
          newGradeValue: gradeStr,
          newGradeStatus: 'FINALIZED',
          newSamaStatusCode: samaCode,
          reason: payload.reason.trim(),
          actorUserId: user.id,
          actorRole: role,
        });
      }
    }

    // همگام‌سازی legacy_grades در صورت تطابق ترم و درس
    if (payload.termCode && payload.courseCode) {
      try {
        await db
          .update(legacy_grades)
          .set({
            gradeValue: gradeStr,
            gradeStatus: 'FINALIZED',
          })
          .where(
            and(
              eq(legacy_grades.studentCode, payload.studentCode),
              eq(legacy_grades.termCode, payload.termCode),
              eq(legacy_grades.courseCode, payload.courseCode),
              legacySource ? eq(legacy_grades.sourceCode, legacySource) : undefined,
            )
          );
      } catch {
        // نادیده‌گیری خطای تطابق سوابق قدیمی
      }
    }

    // همگام‌سازی زنجیره‌ای آیین‌نامه برای تمام دفعات اخذ این درس توسط دانشجو
    try {
      const [offRow] = await db
        .select({ courseId: course_offerings.courseId })
        .from(course_offerings)
        .where(eq(course_offerings.id, targetOfferingId))
        .limit(1);
      if (offRow?.courseId) {
        await syncStudentCourseRegulations(payload.studentId, offRow.courseId, {
          actorUserId: user.id,
          actorRole: role,
        });
      }
    } catch {
      // نادیده‌گیری خطای همگام‌سازی زنجیره‌ای در عملیات مستقیم ادمین
    }

    revalidatePath('/admin/students');
    revalidatePath('/professor/grades');

    // 📢 اعلام تغییر نمره — هر دو کلید از تنظیمات مدیر خاموش/روشن می‌شوند؛
    // اعلان هرگز ثبت نمره را نمی‌شکند (fire-and-forget با catch).
    try {
      const { getBool } = await import('@/lib/settings');
      const [notifyAdmins, notifyProf] = await Promise.all([
        getBool('GRADE_EDIT_NOTIFY_MSG').catch(() => false),
        getBool('GRADE_CHANGE_NOTIFY_PROF').catch(() => true),
      ]);
      if (notifyAdmins || notifyProf) {
        const { notifyUserMultichannel } = await import('@/lib/messaging');
        const gradeTxt = `ثبت نمره توسط ${user.name}: دانشجو ${payload.studentCode} — درس ${payload.courseCode ?? ''} ترم ${payload.termCode ?? ''} → نمره ${gradeStr ?? '—'}`;
        const jobs: Promise<unknown>[] = [];
        if (notifyAdmins) {
          const adminIds = await db.select({ id: users.id }).from(users)
            .innerJoin(user_roles, eq(user_roles.userId, users.id))
            .innerJoin(roles, eq(roles.id, user_roles.roleId))
            .where(and(eq(roles.code, 'ADMIN'), eq(users.isActive, 1), or(eq(users.universityId, uni.id), isNull(users.universityId))))
            .limit(20);
          for (const a of adminIds) {
            jobs.push(notifyUserMultichannel({ userId: a.id, eventCode: 'GRADE_EDIT_ALERT', text: `🔔 ${gradeTxt}` }).catch(() => null));
          }
        }
        if (notifyProf && targetOfferingId) {
          // فقط اگر ارائه در ترم جاری است، به استاد همان درس اطلاع بده
          const [off] = await db.select({
            professorId: course_offerings.professorId,
            isCurrent: academic_terms.isCurrent,
          }).from(course_offerings)
            .leftJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
            .where(eq(course_offerings.id, targetOfferingId)).limit(1);
          if (off?.isCurrent === 1 && off.professorId) {
            const [st] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.id, off.professorId)).limit(1);
            if (st?.userId && st.userId !== user.id) {
              jobs.push(notifyUserMultichannel({
                userId: st.userId,
                eventCode: 'GRADE_CHANGED_BY_ADMIN',
                text: `📝 نمره‌ای از درس شما در ترم جاری توسط ${user.name} تغییر کرد: دانشجو ${payload.studentCode} — درس ${payload.courseCode ?? ''} → نمره ${gradeStr ?? '—'}`,
              }).catch(() => null));
            }
          }
        }
        if (jobs.length) await Promise.all(jobs);
      }
    } catch {
      // اعلان اختیاری است
    }

    return { ok: true, message: 'نمره و کد وضعیت با موفقیت ثبت شد.' };
  } catch (err) {
    return fail(err);
  }
}

/**
 * واکشی تاریخچهٔ تغییرات نمرهٔ یک enrollment
 */
export async function getEnrollmentGradeHistory(enrollmentId: number) {
  const user = await requireRole(['ADMIN', 'GRADUATEAFFAIRS', 'PROFESSOR']);
  const uni = await getCurrentUniversity();
  if (!isRealUniversityId(uni.id)) throw new Error('دانشگاه فعال نامشخص است.');
  const [enr] = await db
    .select({ reqUni: enrollments.universityId, stuUni: students.universityId, offeringId: enrollments.offeringId })
    .from(enrollments)
    .leftJoin(students, eq(students.id, enrollments.studentId))
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);
  if (!enr) return [];
  const owner = enr.reqUni ?? enr.stuUni;
  if (owner !== null && owner !== uni.id) return [];
  if (!user.roles.some(r => r === 'ADMIN' || r === 'GRADUATEAFFAIRS')) {
    const me = await getStaffByUser(user.id);
    if (!me) throw new Error('پروندهٔ هیئت علمی یافت نشد.');
    const [off] = await db.select({ professorId: course_offerings.professorId })
      .from(course_offerings).where(eq(course_offerings.id, enr.offeringId)).limit(1);
    const [co] = await db.select({ staffId: offering_professors.staffId })
      .from(offering_professors)
      .where(and(eq(offering_professors.offeringId, enr.offeringId), eq(offering_professors.staffId, me.id)))
      .limit(1);
    if (off?.professorId !== me.id && !co) throw new Error('شما استاد مسئول این درس نیستید.');
  }
  return db
    .select({
      id: grade_change_log.id,
      enrollmentId: grade_change_log.enrollmentId,
      offeringId: grade_change_log.offeringId,
      action: grade_change_log.action,
      oldGradeValue: grade_change_log.oldGradeValue,
      newGradeValue: grade_change_log.newGradeValue,
      oldGradeStatus: grade_change_log.oldGradeStatus,
      newGradeStatus: grade_change_log.newGradeStatus,
      oldSamaStatusCode: grade_change_log.oldSamaStatusCode,
      newSamaStatusCode: grade_change_log.newSamaStatusCode,
      reason: grade_change_log.reason,
      actorUserId: grade_change_log.actorUserId,
      actorRole: grade_change_log.actorRole,
      createdAt: grade_change_log.createdAt,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
    })
    .from(grade_change_log)
    .leftJoin(users, eq(users.id, grade_change_log.actorUserId))
    .where(eq(grade_change_log.enrollmentId, enrollmentId))
    .orderBy(desc(grade_change_log.createdAt));
}

/**
 * واکشی کلیه لاگ‌های تغییر نمرهٔ یک دانشجو (برای ادمین و کارشناس فارغ‌التحصیلان)
 * + نام درس/کد درس/ترم تا در modal مشخص باشد کدام درس عوض شده.
 */
export async function getStudentGradeAuditLog(studentId: number) {
  await requireRole(['ADMIN', 'GRADUATEAFFAIRS', 'EDU_EXPERT']);
  const uni = await getCurrentUniversity();
  if (!isRealUniversityId(uni.id)) throw new Error('دانشگاه فعال نامشخص است.');
  const [s] = await db.select({ universityId: students.universityId })
    .from(students).where(eq(students.id, studentId)).limit(1);
  if (!s) return [];
  if (s.universityId !== null && s.universityId !== uni.id) return [];
  return db
    .select({
      id: grade_change_log.id,
      enrollmentId: grade_change_log.enrollmentId,
      offeringId: grade_change_log.offeringId,
      action: grade_change_log.action,
      oldGradeValue: grade_change_log.oldGradeValue,
      newGradeValue: grade_change_log.newGradeValue,
      oldGradeStatus: grade_change_log.oldGradeStatus,
      newGradeStatus: grade_change_log.newGradeStatus,
      oldSamaStatusCode: grade_change_log.oldSamaStatusCode,
      newSamaStatusCode: grade_change_log.newSamaStatusCode,
      reason: grade_change_log.reason,
      actorUserId: grade_change_log.actorUserId,
      actorRole: grade_change_log.actorRole,
      createdAt: grade_change_log.createdAt,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      courseCode: courses.code,
      courseTitle: courses.title,
      termCode: academic_terms.termCode,
      termTitle: academic_terms.title,
    })
    .from(grade_change_log)
    .leftJoin(users, eq(users.id, grade_change_log.actorUserId))
    .leftJoin(course_offerings, eq(course_offerings.id, grade_change_log.offeringId))
    .leftJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .where(eq(grade_change_log.studentId, studentId))
    .orderBy(desc(grade_change_log.createdAt));
}

/** لاگ سراسری (همهٔ دانشجویان) — برای صفحهٔ «همهٔ لاگ‌های نمرات» */
export async function getAllGradeAuditLogs(opts?: { limit?: number; offset?: number; q?: string; termCode?: string }) {
  await requireRole(['ADMIN', 'GRADUATEAFFAIRS', 'EDU_EXPERT']);
  const uni = await getCurrentUniversity();
  if (!isRealUniversityId(uni.id)) throw new Error('دانشگاه فعال نامشخص است.');
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);
  // q: فیلتر روی نام درس/کددرس/شماره‌دانشجویی/نام دانشجو (ساده - LIKE)
  const { sql } = await import('drizzle-orm');
  const q = opts?.q?.trim() ?? '';
  const rows = await db
    .select({
      id: grade_change_log.id,
      enrollmentId: grade_change_log.enrollmentId,
      offeringId: grade_change_log.offeringId,
      studentId: grade_change_log.studentId,
      action: grade_change_log.action,
      oldGradeValue: grade_change_log.oldGradeValue,
      newGradeValue: grade_change_log.newGradeValue,
      reason: grade_change_log.reason,
      actorUserId: grade_change_log.actorUserId,
      actorRole: grade_change_log.actorRole,
      createdAt: grade_change_log.createdAt,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      courseCode: courses.code,
      courseTitle: courses.title,
      termCode: academic_terms.termCode,
    })
    .from(grade_change_log)
    .leftJoin(users, eq(users.id, grade_change_log.actorUserId))
    .leftJoin(course_offerings, eq(course_offerings.id, grade_change_log.offeringId))
    .leftJoin(courses, eq(courses.id, course_offerings.courseId))
    .leftJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .innerJoin(students, eq(students.id, grade_change_log.studentId))
    .where(and(
      or(eq(students.universityId, uni.id), isNull(students.universityId)),
      // 🔒 فیلتر ترم باید در WHERE اعمال شود، نه بعد از LIMIT؛ وگرنه برای ترم‌های
      //    قدیمی نتیجهٔ خالی کاذب می‌داد (لاگ‌های آن ترم بیرون از ۲۰۰ رکورد آخر).
      opts?.termCode ? eq(academic_terms.termCode, String(opts.termCode)) : undefined,
    ))
    .orderBy(desc(grade_change_log.createdAt))
    .limit(limit)
    .offset(offset);
  // فیلتر کلاینتی ساده اگر q داده شد (برای اینکه LIKE فارسی نرمال هم بخورد، فعلاً exact)
  if (!q) return rows;
  const nq = q.toLowerCase();
  return rows.filter(r =>
    (r.courseCode ?? '').toLowerCase().includes(nq) ||
    (r.courseTitle ?? '').toLowerCase().includes(nq) ||
    (r.termCode ?? '').includes(nq) ||
    String(r.studentId).includes(nq),
  );
}

/**
 * پیش‌نمایش کد وضعیت سما برای نمرهٔ ورودی در کلاینت
 */
export async function resolveSamaCodeForGradeAction(
  studentId: number,
  offeringId: number,
  gradeValue: number | null,
): Promise<{ code: string | null; title: string }> {
  // 🔒 گارد نقش: این اکشن پیش‌تر هیچ بررسی نقشی نداشت و با یک studentId دلخواه
  //    کد وضعیت نمرهٔ هر دانشجو (هر دانشگاه) خوانده می‌شد.
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  const uni = await getCurrentUniversity().catch(() => null);
  // fail-closed: بدون دانشگاه فعال، هیچ داده‌ای برنمی‌گردد
  if (!uni) return { code: null, title: 'نامشخص' };
  const [s] = await db.select({ universityId: students.universityId })
    .from(students).where(eq(students.id, studentId)).limit(1);
  if (!s || (s.universityId !== null && s.universityId !== uni.id)) {
    return { code: null, title: 'نامشخص' };
  }
  const code = await resolveSamaGradeStatusCode(studentId, offeringId, gradeValue);
  const title = gradeStatusTitleOf(code) || 'نامشخص';
  return { code, title };
}

// ═══════════════════════════════════════════════════════════════════
//  بازمحاسبه دسته‌ای کدهای وضعیت سما بر اساس آیین‌نامه
// ═══════════════════════════════════════════════════════════════════

export interface MismatchRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  courseCode: string;
  courseTitle: string;
  termCode: string;
  gradeValue: string | null;
  currentCode: string | null;
  correctCode: string | null;
  correctTitle: string;
  originalCode: string | null; // کد اصلی وارداتی سما
  regulationTitle: string | null;
}

/**
 * بررسی همه enrollmentها و برگرداندن لیست نمراتی که کد وضعیتشان نادرست است
 */
/**
 * بررسی نمرات و برگرداندن لیست نمراتی که کد وضعیتشان نادرست است.
 * ⚠ اسکن محدود (SCAN_LIMIT) است: بارگذاری کل جدول (۶۷۱هزار ردیف × چند کوئری
 * به‌ازای هر ردیف) اکشن سرور را می‌شکست («unexpected response»). خروجی شامل
 * پرچم truncated است تا کاربر بداند همه پوشش داده نشده.
 */
const SCAN_LIMIT = 2000;
export async function scanMismatchedSamaCodes(universityId?: number): Promise<{ rows: MismatchRow[]; scanned: number; truncated: boolean }> {
  await requireRole(['ADMIN']);

  const uid = await resolveAdminUniversityId(universityId);
  const whereParts: SQL[] = [eq(enrollments.gradeStatus, 'FINALIZED')];
  whereParts.push(eq(students.universityId, uid));
  const allEnrs = await db
    .select({
      enrollmentId: enrollments.id,
      studentId: enrollments.studentId,
      studentCode: students.studentCode,
      studentName: sql<string>`(${users.firstName} || ' ' || ${users.lastName})`,
      courseId: course_offerings.courseId,
      courseCode: courses.code,
      courseTitle: courses.title,
      offeringId: enrollments.offeringId,
      termCode: academic_terms.termCode,
      gradeValue: enrollments.gradeValue,
      gradeStatus: enrollments.gradeStatus,
      currentCode: enrollments.samaGradeStatusCode,
      originalCode: enrollments.originalSamaCode,
      regTitle: educational_regulations.title,
    })
    .from(enrollments)
    .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .innerJoin(academic_terms, eq(academic_terms.id, course_offerings.termId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(educational_regulations, eq(educational_regulations.id, students.regulationId))
    .where(and(...whereParts))
    .orderBy(students.studentCode, academic_terms.termCode)
    .limit(SCAN_LIMIT + 1);

  const truncated = allEnrs.length > SCAN_LIMIT;
  const sample = truncated ? allEnrs.slice(0, SCAN_LIMIT) : allEnrs;
  const mismatches: MismatchRow[] = [];

  // پردازش دسته‌ای برای جلوگیری از overload سرور
  const BATCH = 20;
  for (let i = 0; i < sample.length; i += BATCH) {
    const batch = sample.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (enr) => {
        const correctCode = await resolveSamaGradeStatusCode(enr.studentId, enr.offeringId, enr.gradeValue, enr.currentCode ?? null);
        const cur = enr.currentCode?.trim() || null;
        if (cur !== correctCode) {
          return {
            enrollmentId: enr.enrollmentId,
            studentId: enr.studentId,
            studentCode: enr.studentCode,
            studentName: enr.studentName,
            courseCode: enr.courseCode,
            courseTitle: enr.courseTitle,
            termCode: enr.termCode,
            gradeValue: enr.gradeValue,
            currentCode: cur,
            correctCode,
            correctTitle: gradeStatusTitleOf(correctCode) || 'نامشخص',
            originalCode: enr.originalCode?.trim() || null,
            regulationTitle: enr.regTitle,
          } as MismatchRow;
        }
        return null;
      })
    );
    for (const r of results) {
      if (r) mismatches.push(r);
    }
  }

  return { rows: mismatches, scanned: sample.length, truncated };
}

/**
 * اعمال کدهای صحیح روی نمرات نادرست (بچ اصلاح)
 */
export async function applyCorrectedSamaCodes(enrollmentIds: number[], universityId?: number): Promise<{ applied: number }> {
  const user = await requireRole(['ADMIN']);
  // 🔐 تأیید دومرحله‌ای — همان قرارداد adminSetGradeAction (حوزهٔ grades:edit).
  // فراخوان‌ها try/catch دارند، پس STEPUP_REQUIRED به‌صورت خطا بالا می‌رود.
  const { checkStepUpToken } = await import('@/lib/step-up');
  if (!(await checkStepUpToken(user.id, 'grades:edit'))) {
    throw new Error('STEPUP_REQUIRED:برای اعمال اصلاحات کد سما، ابتدا رمز عبور خود را تأیید کنید (تأیید دومرحله‌ای — ۱۰ دقیقه معتبر است).');
  }
  let applied = 0;
  const uid = await resolveAdminUniversityId(universityId);

  // سقف اندازهٔ دسته برای جلوگیری از overload و قفل طولانی
  const ids = enrollmentIds.slice(0, 500);

  for (const eid of ids) {
    const [enr] = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        offeringId: enrollments.offeringId,
        gradeValue: enrollments.gradeValue,
        currentCode: enrollments.samaGradeStatusCode,
        originalCode: enrollments.originalSamaCode,
      })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.id, eid), eq(students.universityId, uid)))
      .limit(1);
    if (!enr) continue;

    const correctCode = await resolveSamaGradeStatusCode(enr.studentId, enr.offeringId, enr.gradeValue, enr.currentCode ?? null);
    const cur = enr.currentCode?.trim() || null;
    if (cur === correctCode) continue;

    await db
      .update(enrollments)
      .set({
        samaGradeStatusCode: correctCode,
        originalSamaCode: enr.originalCode ?? enr.currentCode,
      })
      .where(eq(enrollments.id, eid));

    await logGradeChange({
      enrollmentId: eid,
      studentId: enr.studentId,
      offeringId: enr.offeringId,
      action: 'ADMIN_OVERRIDE',
      oldGradeValue: enr.gradeValue,
      newGradeValue: enr.gradeValue,
      oldGradeStatus: 'FINALIZED',
      newGradeStatus: 'FINALIZED',
      oldSamaStatusCode: cur,
      newSamaStatusCode: correctCode,
      reason: `بازمحاسبه خودکار کد وضعیت سما بر اساس آیین‌نامه (قبلی: ${cur})`,
      actorUserId: user.id,
      actorRole: 'ADMIN',
    });
    applied++;
  }

  revalidatePath('/admin/regulation-check');
  return { applied };
}

// ═══════════════════════════════════════════════════════════════════
//  مغایرت وضعیت: فارغ‌التحصیل بدون هیچ سابقه نمره
// ═══════════════════════════════════════════════════════════════════

export interface StatusMismatchRow {
  studentId: number;
  studentCode: string;
  studentName: string;
  graduateDate: string | null;
  regulationTitle: string | null;
}

/**
 * دانشجویان با وضعیت GRADUATED که نه enrollment نهایی و نه legacy_grades دارند.
 * (وضعیت از ثبتی آمده ولی جزئیات نمرات در اکسپورت سما جا مانده — مثل انتقالی با سوابق)
 */
export async function scanGraduatedWithoutGrades(limit = 200, universityId?: number): Promise<{ total: number; rows: StatusMismatchRow[] }> {
  await requireRole(['ADMIN']);
  const uid = await resolveAdminUniversityId(universityId);
  const whereParts = [eq(students.status, 'GRADUATED'), isNull(enrollments.id), isNull(legacy_grades.id)];
  whereParts.push(eq(students.universityId, uid));
  const rows = await db
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      studentName: sql<string>`(${users.firstName} || ' ' || ${users.lastName})`,
      graduateDate: students.graduateDate,
      regulationTitle: educational_regulations.title,
    })
    .from(students)
    .leftJoin(educational_regulations, eq(educational_regulations.id, students.regulationId))
    .leftJoin(users, eq(users.id, students.userId))
    .leftJoin(
      enrollments,
      and(eq(enrollments.studentId, students.id), eq(enrollments.gradeStatus, 'FINALIZED')),
    )
    .leftJoin(legacy_grades, eq(legacy_grades.studentCode, students.studentCode))
    .where(and(...whereParts))
    .limit(limit);
  return { total: rows.length, rows };
}

/** بازگرداندن دانشگاه فعال کاربر (برای کامپوننت‌های کلاینت) */
export async function getUniversityId(): Promise<{ universityId: number | null }> {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER', 'GRADUATEAFFAIRS', 'FINANCE_EXPERT', 'FINANCE', 'VICE_EDU']);
  const u = await getCurrentUniversity();
  return { universityId: u?.id ?? null };
}

// ═══════════════════════════════════════════════════════════════════
//  بررسی دومرحله‌ای درخواست بازگشایی نمرات نهایی‌شده
//  مرحلهٔ ۱ (PENDING → REVIEWED|REJECTED): ADMIN / GRADUATEAFFAIRS
//  مرحلهٔ ۲ (REVIEWED → APPROVED|REJECTED): فقط VICE_EDU (معاون آموزشی)
//  با APPROVED: gradesFinalizedAt=NULL + بازگشت به TEMPORARY + لاگ UNFINALIZE
// ═══════════════════════════════════════════════════════════════════

export async function reviewUnfinalizeAction(
  requestId: number,
  decision: 'REVIEWED' | 'APPROVED' | 'REJECTED',
  note?: string | null,
  extendDeadlineTo?: string | null,
): Promise<AdminGradeState> {
  try {
    const cleanNote = (note ?? '').trim() || null;

    // ── گیت نقش بر اساس مرحله ──
    let user: { id: number; name: string; roles: string[] };
    if (decision === 'APPROVED' || decision === 'REJECTED') {
      // REJECTED ممکن است در هر دو مرحله رخ دهد؛ مرحله را از وضعیت رکورد می‌فهمیم.
      // ابتدا رکورد را می‌خوانیم تا بدانیم در کدام مرحله‌ایم (نیاز به uni دارد — بعداً).
      user = await requireRole(['ADMIN', 'GRADUATEAFFAIRS', 'VICE_EDU']).catch(() => null as never);
      if (!user) return { ok: false, error: 'شما مجوز بررسی درخواست بازگشایی را ندارید.' };
    } else {
      user = await requireRole(['ADMIN', 'GRADUATEAFFAIRS']);
    }

    const [req] = await db
      .select()
      .from(grade_unfinalize_requests)
      .where(eq(grade_unfinalize_requests.id, requestId))
      .limit(1);
    if (!req) return { ok: false, error: 'درخواست یافت نشد.' };

    // ── گیت دقیق مرحله ──
    if (req.status === 'PENDING') {
      if (decision === 'APPROVED') {
        return { ok: false, error: 'این درخواست هنوز مرحلهٔ اول را نگذرانده است؛ ابتدا بررسی مرحلهٔ اول لازم است.' };
      }
      // PENDING → REVIEWED|REJECTED: فقط ADMIN/GRADUATEAFFAIRS
      if (!user.roles.includes('ADMIN') && !user.roles.includes('GRADUATEAFFAIRS')) {
        return { ok: false, error: 'بررسی مرحلهٔ اول فقط با مدیر یا کارشناس فارغ‌التحصیلان است.' };
      }
    } else if (req.status === 'REVIEWED') {
      // REVIEWED → APPROVED|REJECTED: فقط VICE_EDU (انحصاری)
      try {
        await requireRole(['VICE_EDU']);
      } catch {
        return { ok: false, error: 'تأیید نهایی فقط با معاون آموزشی است.' };
      }
    } else {
      return { ok: false, error: 'این درخواست قبلاً تعیین‌تکلیف شده است.' };
    }

    // 🔐 تأیید دومرحله‌ای (همان قرارداد adminSetGradeAction)
    const { checkStepUpToken } = await import('@/lib/step-up');
    if (!(await checkStepUpToken(user.id, 'grades:edit'))) {
      return { ok: false, error: 'STEPUP_REQUIRED:برای بررسی درخواست بازگشایی، ابتدا رمز عبور خود را تأیید کنید (تأیید دومرحله‌ای — ۱۰ دقیقه معتبر است).' };
    }

    // اسکوپ دانشگاه (همان الگوی لاگ: cookie uni)
    const { getCurrentUniversity } = await import('@/lib/university-scope');
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };
    if (req.universityId !== null && req.universityId !== uni.id) {
      return { ok: false, error: 'درخواست متعلق به دانشگاه دیگری است.' };
    }
    // دفاع‌عمقی NULL-uni: مالکیت دانشگاهی خود ارائه هم راستی‌آزمایی شود
    // (رکوردهای قدیمی/دستی بدون universityId نباید از دانشگاه دیگر تأیید شوند)
    const [offUni] = await db.select({ universityId: course_offerings.universityId })
      .from(course_offerings).where(eq(course_offerings.id, req.offeringId)).limit(1);
    if (!offUni) return { ok: false, error: 'ارائهٔ درخواست یافت نشد.' };
    if (offUni.universityId !== null && offUni.universityId !== uni.id) {
      return { ok: false, error: 'ارائه متعلق به دانشگاه دیگری است.' };
    }
    const offUniId = offUni.universityId ?? null;

    if (decision === 'APPROVED') {
      // اعتبارسنجی مهلت اختصاصی (اختیاری): فقط تاریخ واقعی با now < ext < now+60days
      // پذیرفته می‌شود؛ در غیر این صورت نادیده گرفته می‌شود (نوشته نمی‌شود، خطا هم نمی‌دهد).
      let extDate: Date | null = null;
      if (extendDeadlineTo && extendDeadlineTo.trim()) {
        const t = new Date(extendDeadlineTo.trim()).getTime();
        const nowMs = Date.now();
        if (!Number.isNaN(t) && t > nowMs && t < nowMs + 60 * 24 * 60 * 60 * 1000) {
          extDate = new Date(t);
        }
      }
      // 🔒 ضد TOCTOU: قفل ردیف (FOR UPDATE) + بازبینی وضعیت داخل تراکنش +
      // محمول WHERE status='REVIEWED' با راستی‌آزمایی rowCount (returning).
      try {
        await db.transaction(async (tx) => {
          const locked = await tx
            .select({ status: grade_unfinalize_requests.status })
            .from(grade_unfinalize_requests)
            .where(eq(grade_unfinalize_requests.id, requestId))
            .for('update');
          if (!locked[0] || locked[0].status !== 'REVIEWED') throw new Error('UNFINALIZE_STALE');
          const updated = await tx
            .update(grade_unfinalize_requests)
            .set({ status: 'APPROVED', reviewedByUserId: user.id, reviewNote: cleanNote, reviewedAt: new Date() })
            .where(and(eq(grade_unfinalize_requests.id, requestId), eq(grade_unfinalize_requests.status, 'REVIEWED')))
            .returning({ id: grade_unfinalize_requests.id });
          if (updated.length === 0) throw new Error('UNFINALIZE_STALE');
          await tx
            .update(course_offerings)
            .set({
              gradesFinalizedAt: null,
              gradesTemporaryAt: new Date(),
              ...(extDate ? { customGradeDeadline: extDate } : {}),
            })
            // قید دانشگاهی فقط وقتی معلوم است (رکورد legacy با NULL همان id را می‌گیرد)
            .where(offUniId !== null
              ? and(eq(course_offerings.id, req.offeringId), eq(course_offerings.universityId, offUniId))
              : eq(course_offerings.id, req.offeringId));
        });
      } catch (err) {
        if ((err as Error)?.message === 'UNFINALIZE_STALE') {
          return { ok: false, error: 'این درخواست هم‌زمان توسط دیگری تعیین‌تکلیف شد؛ لطفاً فهرست را تازه کنید.' };
        }
        throw err;
      }
      const { logBulkGradeChange } = await import('@/lib/grade-change-log');
      await logBulkGradeChange(req.offeringId, 'UNFINALIZE', user.id, 'ADMIN', cleanNote ?? 'تأیید بازگشایی نمرات توسط معاون آموزشی').catch(() => null);
    } else {
      // REVIEWED یا REJECTED: فقط به‌روزرسانی ردیف درخواست
      await db
        .update(grade_unfinalize_requests)
        .set({ status: decision, reviewedByUserId: user.id, reviewNote: cleanNote, reviewedAt: new Date() })
        .where(eq(grade_unfinalize_requests.id, requestId));
    }

    revalidatePath('/admin/grades/audit');
    revalidatePath('/professor/grades');

    // 📢 اطلاع به استاد درخواست‌کننده (fire-and-forget)
    {
      const { notifyUserMultichannel } = await import('@/lib/messaging');
      const decisionFa = decision === 'APPROVED' ? 'تأیید نهایی شد ✅' : decision === 'REVIEWED' ? 'مرحلهٔ اول تأیید شد و در انتظار معاون آموزشی است ⏳' : 'رد شد ❌';
      const text = `📬 نتیجهٔ درخواست بازگشایی نمرات (ارائهٔ ${req.offeringId}): ${decisionFa}${cleanNote ? ` — توضیح: ${cleanNote}` : ''}`;
      notifyUserMultichannel({ userId: req.requestedByUserId, eventCode: 'GRADE_UNFINALIZE_DECIDED', text }).catch(() => null);
    }

    return { ok: true, message: decision === 'APPROVED' ? 'نمرات به «موقت» بازگشایی شد.' : decision === 'REVIEWED' ? 'مرحلهٔ اول ثبت شد؛ در انتظار معاون آموزشی.' : 'درخواست رد شد.' };
  } catch (err) {
    return fail(err);
  }
}
