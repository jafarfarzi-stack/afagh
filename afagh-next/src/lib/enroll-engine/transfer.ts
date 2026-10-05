import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, enrollments } from '@/db/schema';
import { parseGrade, parseUnits } from '../regulations-engine';
import { computeGradeStatus } from '@/lib/grade-utils';
import { EQUIV_MIN_GRADE } from './constants';

// ══════════════════════════════════════════════════════════════════════
//  ثبت درس تطبیق‌داده‌شده (معادل‌سازی) — هندلر رویداد موتور گردش کار
//
//  موتور BPM در لحظهٔ «تأیید نهایی» فرایند COURSE_TRANSFER فقط رویداد شلیک
//  می‌کند؛ ثبت درس در کارنامه کارِ خودِ موتور آموزش است (جداسازی دغدغه‌ها).
//  این تابع ایدمپوتنت است: اجرای دوبارهٔ رویداد، ردیف تکراری نمی‌سازد.
// ══════════════════════════════════════════════════════════════════════

export type TransferApplyResult = {
  ok: boolean;
  enrollmentId?: number;
  offeringId?: number;
  createdOffering?: boolean;
  message: string;
};

/**
 * لایهٔ دیتابیسِ قابل تزریق (`db` اصلی یا تراکنش) — تا منطق دامنهٔ این فایل
 * بدون اتصال به PostgreSQL هم قابل Unit Test باشد.
 */
export type EnrollDb = {
  select(fields?: unknown): any;
  insert(table: unknown): any;
  update(table: unknown): any;
  transaction<T>(cb: (tx: EnrollDb) => Promise<T>): Promise<T>;
};

/** پیام خطای نبودِ دامنهٔ دانشگاه — هرگز به کوئری سراسری برنمی‌گردیم */
export const NO_UNIVERSITY_MSG = 'دانشگاه دانشجو مشخص نیست؛ ثبت درس تطبیق‌داده‌شده بدون دامنهٔ دانشگاه ممکن نیست.';

const uniEq = (id: number) => Number.isFinite(Number(id)) && Number(id) > 0;

/**
 * درس مقصد از چارت «همان دانشگاه».
 *
 * ⚠️ `courses.code` فقط درون یک دانشگاه یکتاست (uq_courses_uni_code روی
 * (universityId, code)) و کدهای شمس با کدهای آفاق عددی تصادف می‌کنند؛
 * بنابراین فیلتر دانشگاه اجباری است و «بی‌دامنه» یعنی اتصال به ردیف دانشگاه دیگر.
 * علاوه بر فیلتر SQL، انتخاب نهایی هم دوباره دانشگاه را چک می‌کند (دفاع تکمیلی).
 */
export async function resolveTargetCourse(dbx: EnrollDb, universityId: number, code: string) {
  const uid = Number(universityId);
  const rows = await dbx.select().from(courses)
    .where(and(eq(courses.code, code), eq(courses.universityId, uid)))
    .limit(1);
  return rows.find((r: { universityId: number | null }) => Number(r.universityId) === uid) ?? null;
}

/**
 * ترم جاری «همان دانشگاه» — چون چند دانشگاه هم‌زمان ترم جاری دارند
 * (SHAMS ۱۳۹۹۲ / AFAGH ۱۴۰۵۱ / ALLAME ۱۴۰۳۲)، انتخاب بی‌دامنه دلخواهی است.
 */
export async function resolveCurrentTerm(dbx: EnrollDb, universityId: number) {
  const uid = Number(universityId);
  const rows = await dbx.select().from(academic_terms)
    .where(and(eq(academic_terms.isCurrent, 1), eq(academic_terms.universityId, uid)))
    .limit(4);
  return rows.find((r: { universityId: number | null }) => Number(r.universityId) === uid) ?? null;
}

export async function applyCourseTransfer(input: {
  studentId: number;
  /** دانشگاه مالکِ دانشجو/چارت مقصد — اجباری: بدون آن کوئری سراسری ممنوع است */
  universityId: number;
  targetCourseCode?: string;
  sourceCourseTitle?: string;
  sourceGrade?: string | number | null;
  sourceUnits?: string | number | null;
  previousUniversity?: string;
  workflowRequestId?: number | null;
}): Promise<TransferApplyResult> {
  if (!uniEq(input.universityId)) return { ok: false, message: NO_UNIVERSITY_MSG };

  const code = String(input.targetCourseCode ?? '').trim();
  if (!code) return { ok: false, message: 'کد درس مقصد در فرم تطبیق واحد وارد نشده است.' };

  const course = await resolveTargetCourse(db, input.universityId, code);
  if (!course) return { ok: false, message: `درس مقصد با کد «${code}» در چارت دانشگاه تعریف نشده است.` };

  const term = await resolveCurrentTerm(db, input.universityId);
  if (!term) return { ok: false, message: 'ترم جاری دانشگاه مشخص نیست؛ ثبت درس تطبیق‌شده ممکن نشد.' };

  // آفرینگ اختصاصی تطبیق واحد — از ظرفیت کلاس‌های عادی چیزی کم نمی‌کند
  let [offering] = await db
    .select()
    .from(course_offerings)
    .where(and(
      eq(course_offerings.courseId, course.id),
      eq(course_offerings.termId, term.id),
      eq(course_offerings.offeringType, 'TRANSFER'),
    ))
    .limit(1);

  let createdOffering = false;
  if (!offering) {
    const [made] = await db
      .insert(course_offerings)
      .values({
        termId: term.id,
        courseId: course.id,
        groupNumber: 900,
        capacity: 500,
        enrolledCount: 0,
        offeringType: 'TRANSFER',
        isActive: 1,
      })
      .onConflictDoNothing()
      .returning();
    offering = made ?? (await db
      .select()
      .from(course_offerings)
      .where(and(
        eq(course_offerings.courseId, course.id),
        eq(course_offerings.termId, term.id),
        eq(course_offerings.offeringType, 'TRANSFER'),
      ))
      .limit(1))[0];
    createdOffering = true;
  }
  if (!offering) return { ok: false, message: 'ساخت گروه تطبیق واحد برای درس مقصد ممکن نشد.' };

  const grade = parseGrade(input.sourceGrade);
  const units = parseUnits(input.sourceUnits);

  // §آیین‌نامه: فقط نمرات ۱۲ و بالاتر قابل معادل‌سازی است — از همان ابتدا اعمال می‌شود
  if (grade !== null && grade < EQUIV_MIN_GRADE) {
    return {
      ok: false,
      message: `بر اساس آیین‌نامه، فقط نمرات ${EQUIV_MIN_GRADE} و بالاتر قابل معادل‌سازی است (نمرهٔ واردشده: ${grade}).`,
    };
  }

  // ثبت یا به‌روزرسانی ردیف کارنامه.
  // عمداً از onConflictDoUpdate استفاده نمی‌کنیم: به قید یکتاییِ
  // («studentId», «offeringId») وابسته نباشد تا در دیتابیس‌های قدیمی‌تر که
  // این قید هنوز ساخته نشده هم درست کار کند.
  const [existing] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.studentId, input.studentId), eq(enrollments.offeringId, offering.id)))
    .limit(1);

  const payload = {
    status: 'REGISTERED',
    workflowRequestId: input.workflowRequestId ?? null,
    gradeValue: grade === null ? null : String(grade),
    gradeStatus: computeGradeStatus(grade),
  };

  const row = existing
    ? (await db.update(enrollments).set(payload).where(eq(enrollments.id, existing.id)).returning({ id: enrollments.id }))[0]
    : (await db
        .insert(enrollments)
        .values({ studentId: input.studentId, offeringId: offering.id, isDirectedReading: 0, ...payload })
        .returning({ id: enrollments.id }))[0];

  if (createdOffering) {
    await db
      .update(course_offerings)
      .set({ enrolledCount: sql`(select count(*)::int from enrollments where "offeringId" = ${offering.id} and status <> 'DROPPED')` })
      .where(eq(course_offerings.id, offering.id));
  }

  return {
    ok: true,
    enrollmentId: row?.id,
    offeringId: offering.id,
    createdOffering,
    message: `درس «${course.title}» با نمرهٔ ${grade === null ? 'ثبت‌نشده' : grade} و ${units} واحد از ${input.previousUniversity || 'دانشگاه مبدأ'} در کارنامه ثبت شد.`,
  };
}
