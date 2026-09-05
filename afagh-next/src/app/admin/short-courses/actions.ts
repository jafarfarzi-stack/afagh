'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { short_term_courses, short_term_discounts, short_term_learners, short_term_registrations } from '@/db/schema';
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

// ─────────────────────────────────────────────────────────────────────────────
// کدهای تخفیف دوره‌های آزاد — جدول واقعی short_term_discounts (نه state کلاینت)
// ─────────────────────────────────────────────────────────────────────────────

/** فهرست کدهای تخفیف (بر اساس دورهٔ اختیاری) */
export async function listDiscountCodesAction(courseId?: number) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const rows = await db.select().from(short_term_discounts)
    .where(courseId ? eq(short_term_discounts.courseId, Number(courseId)) : undefined)
    .orderBy(short_term_discounts.id);
  return ok(rows.map(r => ({
    id: r.id, code: r.code, courseId: r.courseId, discountPercent: r.discountPercent,
    maxDiscountAmount: r.maxDiscountAmount, maxUsage: r.maxUsage ?? 100,
    usedCount: r.usedCount ?? 0, isActive: r.isActive ?? 1,
  })));
}

/** ساخت کد تخفیف جدید (درصد + سقف مبلغ + سهمیهٔ مصرف) */
export async function createDiscountCodeAction(input: {
  code: string; courseId?: number; discountPercent: number; maxDiscountAmount?: number; maxUsage?: number;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const code = String(input.code ?? '').trim().toUpperCase();
  const percent = Number(input.discountPercent);
  if (!/^[A-Z0-9]{3,20}$/.test(code)) return fail('کد تخفیف باید ۳ تا ۲۰ کاراکتر انگلیسی/رقمی باشد.');
  if (!(percent >= 1 && percent <= 100)) return fail('درصد تخفیف باید بین ۱ تا ۱۰۰ باشد.');
  if (input.maxUsage != null && (!Number.isInteger(Number(input.maxUsage)) || Number(input.maxUsage) < 1)) return fail('سهمیهٔ مصرف باید عدد صحیح مثبت باشد.');

  try {
    const [row] = await db.insert(short_term_discounts).values({
      code,
      courseId: input.courseId ? Number(input.courseId) : null,
      discountPercent: percent,
      maxDiscountAmount: input.maxDiscountAmount ? Number(input.maxDiscountAmount) : null,
      maxUsage: input.maxUsage ? Number(input.maxUsage) : 100,
      isActive: 1,
    }).returning({ id: short_term_discounts.id, code: short_term_discounts.code });
    log.info('discount_code_created', { discountId: row.id, code: row.code });
    return ok({ id: row.id, code: row.code });
  } catch (err) {
    return fail('ساخت کد تخفیف ناموفق بود (ممکن است کد تکراری باشد): ' + (err as Error).message);
  }
}

/** فعال/غیرفعال‌سازی کد تخفیف */
export async function toggleDiscountCodeAction(discountId: number, isActive: boolean) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const [row] = await db.update(short_term_discounts)
    .set({ isActive: isActive ? 1 : 0 })
    .where(eq(short_term_discounts.id, Number(discountId)))
    .returning({ id: short_term_discounts.id, isActive: short_term_discounts.isActive });
  if (!row) return fail('کد تخفیف یافت نشد.');
  return ok({ id: row.id, isActive: row.isActive });
}

/** تأیید واریز شهریهٔ ثبت‌نام دورهٔ آزاد (کارشناس) — PENDING → PAID */
export async function confirmPaymentAction(input: { registrationId: number; paymentRefId: string; amountPaid: number }) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const regId = Number(input.registrationId);
  const amount = Math.round(Number(input.amountPaid));
  const refId = String(input.paymentRefId ?? '').trim();
  if (!regId || !refId || !(amount >= 0)) return fail('شناسهٔ ثبت‌نام، شمارهٔ پیگیری و مبلغ الزامی است.');

  const [row] = await db.update(short_term_registrations)
    .set({ paymentStatus: 'PAID', amountPaid: amount, paymentRefId: refId })
    .where(eq(short_term_registrations.id, regId))
    .returning({ id: short_term_registrations.id, trackingCode: short_term_registrations.trackingCode });
  if (!row) return fail('ثبت‌نام یافت نشد.');
  log.info('short_term_payment_confirmed', { registrationId: regId, amount, refId });
  return ok({ registrationId: row.id, trackingCode: row.trackingCode });
}
