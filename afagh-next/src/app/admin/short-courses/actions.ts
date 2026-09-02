'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { short_term_courses, short_term_learners, short_term_registrations } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { issueShortTermCertificate, revokeCertificate } from '@/lib/verification';
import { invalidateSettingsCache } from '@/lib/settings';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'short-courses' });

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/** تعریف دورهٔ آزاد جدید */
export async function createShortCourseAction(input: {
  code: string; title: string; titleEn?: string; category: string;
  hours: number; tuitionPrice: number; capacity: number; instructorName: string;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const code = String(input.code ?? '').trim().toUpperCase();
  const title = String(input.title ?? '').trim();
  const instructorName = String(input.instructorName ?? '').trim();
  if (!code || !title || !instructorName) return fail('کد، عنوان و نام مدرس الزامی است.');

  const [dup] = await db.select({ id: short_term_courses.id }).from(short_term_courses).where(eq(short_term_courses.code, code)).limit(1);
  if (dup) return fail(`کد دوره «${code}» پیش‌تر ثبت شده است.`);

  const [row] = await db.insert(short_term_courses).values({
    code, title,
    titleEn: String(input.titleEn ?? '').trim() || null,
    category: String(input.category ?? 'مهندسی و فناوری').trim(),
    hours: Math.max(1, Math.round(Number(input.hours) || 0)),
    tuitionPrice: Math.max(0, Math.round(Number(input.tuitionPrice) || 0)),
    capacity: Math.max(1, Math.round(Number(input.capacity) || 0)),
    instructorName,
  }).returning({ id: short_term_courses.id });

  log.info('short_course_created', { id: row.id, code });
  return ok({ id: row.id, code });
}

/** ثبت شرکت‌کنندهٔ جدید در یک دوره */
export async function addLearnerAction(input: {
  courseId: number; fullName: string; fullNameEn?: string; nationalId?: string; mobile: string;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const mobile = String(input.mobile ?? '').trim();
  const fullName = String(input.fullName ?? '').trim();
  if (!mobile || !fullName) return fail('نام و شمارهٔ همراه الزامی است.');

  const [learner] = await db.insert(short_term_learners).values({
    mobile, fullName,
    fullNameEn: String(input.fullNameEn ?? '').trim() || null,
    nationalId: String(input.nationalId ?? '').trim() || null,
  }).returning({ id: short_term_learners.id });

  const trackingCode = `AFQ-${Date.now().toString(36).toUpperCase()}`;
  const [reg] = await db.insert(short_term_registrations).values({
    learnerId: learner.id,
    courseId: Number(input.courseId),
    trackingCode,
    paymentStatus: 'PENDING',
  }).returning({ id: short_term_registrations.id });

  log.info('short_term_learner_added', { learnerId: learner.id, registrationId: reg.id });
  return ok({ learnerId: learner.id, registrationId: reg.id, trackingCode });
}

/** ثبت نمره/حضور — همان قاعدهٔ قبولی که در تعریف دوره ذخیره شده */
export async function updateRegistrationAction(input: {
  registrationId: number; attendanceCount?: number; finalGrade?: number | null;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const [reg] = await db
    .select({ id: short_term_registrations.id, courseId: short_term_registrations.courseId, totalSessions: short_term_registrations.totalSessions })
    .from(short_term_registrations)
    .where(eq(short_term_registrations.id, Number(input.registrationId)))
    .limit(1);
  if (!reg) return fail('ثبت‌نام یافت نشد.');

  const [course] = await db.select({ passingGrade: short_term_courses.passingGrade, maxAbsences: short_term_courses.maxAbsences })
    .from(short_term_courses).where(eq(short_term_courses.id, reg.courseId)).limit(1);

  const attendance = input.attendanceCount != null
    ? Math.max(0, Math.round(Number(input.attendanceCount)))
    : undefined;
  const grade = input.finalGrade === null ? null
    : input.finalGrade != null ? Math.round(Number(input.finalGrade) * 100) / 100
    : undefined;

  const passing = Number(course?.passingGrade ?? 12);
  const maxAbsences = Number(course?.maxAbsences ?? 3);

  const patch: Record<string, unknown> = {};
  if (attendance != null) patch.attendanceCount = attendance;
  if (grade !== undefined) patch.finalGrade = grade;

  // قبولی فقط وقتی BOTH شرط برقرار باشد؛ هیچ‌کدام هاردکد نیست
  const finalAttendance = attendance ?? undefined;
  const finalGrade = grade !== undefined ? grade : undefined;
  if (finalAttendance != null && finalGrade != null) {
    const absences = Math.max(0, (reg.totalSessions ?? 0) - finalAttendance);
    patch.isPassed = finalGrade >= passing && absences <= maxAbsences ? 1 : 0;
  }

  await db.update(short_term_registrations).set(patch).where(eq(short_term_registrations.id, reg.id));
  const [after] = await db.select({ isPassed: short_term_registrations.isPassed, finalGrade: short_term_registrations.finalGrade, attendanceCount: short_term_registrations.attendanceCount })
    .from(short_term_registrations).where(eq(short_term_registrations.id, reg.id)).limit(1);
  return ok({ registrationId: reg.id, isPassed: after.isPassed === 1, finalGrade: Number(after.finalGrade ?? 0), attendanceCount: after.attendanceCount ?? 0 });
}

/** صدور گواهینامهٔ رسمی با اثر انگشت امنیتی */
export async function issueCertificateAction(registrationId: number) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  try {
    const res = await issueShortTermCertificate(Number(registrationId));
    return ok(res);
  } catch (err) {
    return fail((err as Error)?.message || 'صدور گواهینامه ناموفق بود.');
  }
}

/** باطل‌سازی گواهینامه */
export async function revokeCertificateAction(certificateNumber: string) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const code = String(certificateNumber ?? '').trim().toUpperCase();
  if (!code) return fail('شمارهٔ گواهینامه را وارد کنید.');
  await revokeCertificate(code);
  log.info('certificate_revoked', { certificateNumber: code });
  return ok({ certificateNumber: code });
}

/** به‌روزرسانی ظرفیت/وضعیت دوره */
export async function updateCourseStatusAction(courseId: number, status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED') {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  await db.update(short_term_courses).set({ status }).where(eq(short_term_courses.id, Number(courseId)));
  return ok({ courseId: Number(courseId), status });
}

/** همگام‌سازی شمار ثبت‌نام‌شده‌ها با واقعیت جدول (بدون شمارش در Node) */
export async function syncEnrolledCountsAction() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  await db.execute(sql`
    update short_term_courses c
       set "enrolledCount" = coalesce(x.n, 0)
      from (select "courseId", count(*)::int n from short_term_registrations group by "courseId") x
     where x."courseId" = c.id
  `);
  invalidateSettingsCache();
  return ok({ synced: true });
}
