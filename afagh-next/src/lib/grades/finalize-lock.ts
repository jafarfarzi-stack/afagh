import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { course_offerings, enrollments, grade_unfinalize_requests } from '@/db/schema';

/**
 * ══════════════════════════════════════════════════════════════════════
 *  گیت مرکزی تغییر نمرهٔ نهایی‌شده (Finalized Grade Lock)
 *
 *  مشکل: نمرهٔ `FINALIZED` عملاً قفل نبود. سه مسیر مستقل آن را بازنویسی
 *  می‌کردند بدون آنکه از تأیید دومرحله‌ایِ «بازگشایی نمره» عبور کنند:
 *    ۱) `adminSetGradeAction` (ادمین/کارشناس فارغ‌التحصیلی)
 *    ۲) پاسخ به اعتراض امتحان (`exam-engine`)
 *    ۳) ثبت/ویرایش نمره توسط استاد و ارسال نمرهٔ امتحان
 *  یعنی یک کاربر با دسترسی «ویرایش نمره» می‌توانست نمرهٔ قطعی را عوض کند
 *  و دانشجو همان لحظه فارغ‌التحصیل شود — بدون اینکه معاون آموزشی در جریان
 *  باشد.
 *
 *  قانون (تنها مرجع): هر نوشتنی روی ردیف `FINALIZED` فقط وقتی مجاز است که
 *  برای همان ارائه یک درخواست بازگشاییِ **تأییدشده** وجود داشته باشد و
 *  ارائه هنوز نهایی نشده باشد (`gradesFinalizedAt IS NULL`). به‌محض تأیید،
 *  درخواست مصرف می‌شود (status = 'APPLIED') تا یک بار قابل استفاده باشد.
 * ══════════════════════════════════════════════════════════════════════
 */

export interface FinalizedWriteGate {
  ok: boolean;
  /** پیام فارسی برای نمایش به کاربر */
  error?: string;
  /** آیا این نوشتن مجاز است */
  allowed: boolean;
}

/** آیا این ارائه در وضعیت «نمرات نهایی‌شده» است؟ */
export async function isOfferingFinalized(offeringId: number): Promise<boolean> {
  const [off] = await db
    .select({ finalizedAt: course_offerings.gradesFinalizedAt })
    .from(course_offerings)
    .where(eq(course_offerings.id, offeringId))
    .limit(1);
  return !!off?.finalizedAt;
}

/**
 * آیا این نوشتن روی نمرهٔ نهایی‌شده مجاز است؟
 *
 * @param offeringId ارائه‌ای که نمره‌اش دستکاری می‌شود
 * @param opts.allowUnfinalizedRequest اگر `true` باشد، وجود درخواست بازگشاییِ
 *        تأییدشده کافی است (حالت «پس از تأیید، نمره را می‌نویسیم»).
 *        اگر `false` باشد (حالت «می‌خواهم خودِ بازگشایی را انجام دهم»)،
 *        درخواست باید همین حالا APPROVED باشد و پس از مصرف، ارائه باز می‌شود.
 */
export async function assertGradeWriteAllowed(
  offeringId: number,
  opts: { allowUnfinalizedRequest?: boolean } = {},
): Promise<FinalizedWriteGate> {
  const finalized = await isOfferingFinalized(offeringId);
  if (!finalized) return { ok: true, allowed: true };

  // قفل باز است ⇒ باید یک درخواست بازگشاییِ تأییدشده وجود داشته باشد
  const [approved] = await db
    .select({ id: grade_unfinalize_requests.id })
    .from(grade_unfinalize_requests)
    .where(and(
      eq(grade_unfinalize_requests.offeringId, offeringId),
      eq(grade_unfinalize_requests.status, 'APPROVED'),
    ))
    .limit(1);
  if (!approved) {
    return {
      ok: false,
      allowed: false,
      error: 'نمرات این درس نهایی شده است. برای هر تغییر، ابتدا درخواست بازگشایی نمره ثبت و پس از تأیید معاون آموزشی اقدام کنید.',
    };
  }
  return { ok: true, allowed: true };
}

const EXEMPT_COURSE_NATURES = new Set([
  'کارآموزی',
  'پایان‌نامه',
  'پایان نامه',
  'رساله',
  'THESIS',
  'INTERNSHIP',
]);

function isExemptGradeWindowCourse(courseNature: string | null | undefined, offeringType: string | null | undefined) {
  const nature = String(courseNature ?? '').trim();
  const type = String(offeringType ?? '').trim().toUpperCase();
  if (type === 'DIRECTED_READING') return true; // معرفی به استاد: از نحوه ارائه درس در ترم
  if (!nature) return false;
  if (EXEMPT_COURSE_NATURES.has(nature)) return true;
  const normalized = nature.replace(/\s+/g, '');
  return normalized.includes('کارآموزی') || normalized.includes('پایاننامه') || normalized.includes('رساله');
}

/**
 * مهلت ثبت نمرهٔ یک ارائه.
 *
 * قانون: ثبت نمره فقط وقتی مجاز است که بازهٔ زمان‌بندی نمره فعال باشد.
 * مهلت اختصاصی ارائه (`customGradeDeadline`) بر مهلت ترم (`academic_terms.gradeEntryDeadline`)
 * اولویت دارد. اگر هیچ بازه‌ای تنظیم نشده باشد، ثبت نمره بسته است (نه همیشه باز).
 *
 * استثناهای دارای زمان‌بندی جدا: کارآموزی/پایان‌نامه/رساله (از نوع/ماهیت درس)
 * و معرفی به استاد (از نحوه ارائه درس در ترم: DIRECTED_READING). این دروس هم فقط در
 * بازهٔ زمان‌بندی خودشان باز هستند؛ معمولاً از `customGradeDeadline` استفاده می‌کنند.
 */
export async function assertGradeDeadline(offeringId: number): Promise<FinalizedWriteGate> {
  const res = await db.execute(sql`
    SELECT
      o."offeringType" AS "offeringType",
      c."courseNature" AS "courseNature",
      COALESCE(o."customGradeDeadline", t."gradeEntryDeadline") AS "deadline",
      (
        COALESCE(o."customGradeDeadline", t."gradeEntryDeadline") IS NOT NULL
        AND now() <= COALESCE(o."customGradeDeadline", t."gradeEntryDeadline")
      ) AS allowed
      FROM course_offerings o
      JOIN academic_terms t ON t.id = o."termId"
      LEFT JOIN courses c ON c.id = o."courseId"
     WHERE o.id = ${offeringId}
     LIMIT 1`);
  const row = res.rows[0] as {
    offeringType: string | null;
    courseNature: string | null;
    deadline: string | Date | null;
    allowed: boolean;
  } | undefined;
  // ارائه/ترم یافت نشد ⇒ بستنِ مسیر (fail closed)
  if (!row) return { ok: false, allowed: false, error: 'ارائهٔ درس یافت نشد.' };

  if (!row.allowed) {
    const exempt = isExemptGradeWindowCourse(row.courseNature, row.offeringType);
    return {
      ok: false,
      allowed: false,
      error: row.deadline
        ? 'مهلت ثبت نمرهٔ این درس به پایان رسیده است؛ برای تمدید با آموزش تماس بگیرید.'
        : exempt
          ? 'برای این درس (کارآموزی/پایان‌نامه/معرفی به استاد) بازهٔ زمان‌بندی ثبت نمره تعیین نشده است؛ ثبت نمره فقط در بازهٔ تعیین‌شده مجاز است.'
          : 'بازهٔ زمان‌بندی ثبت نمره برای این ترم/درس فعال نیست؛ ثبت نمره فقط در بازهٔ تعیین‌شده مجاز است.',
    };
  }
  return { ok: true, allowed: true };
}

/**
 * آیا نمرهٔ همین ردیف (دانشجو × ارائه) قابل نوشتن است؟
 *
 * قفلِ سطحِ ارائه (که با `gradesFinalizedAt` کار می‌کند) عملاً در داده‌های
 * فعلی چیزی را محافظت نمی‌کند؛ ردیف‌های `FINALIZED` باید مستقل بررسی شوند.
 * نبودِ ردیف مجاز است: فراخوان خودش می‌داند که ردیفی وجود ندارد و
 * ساخت/رد کردن آن را جداگانه تصمیم می‌گیرد.
 */
export async function assertRowGradeWritable(
  studentId: number,
  offeringId: number,
): Promise<FinalizedWriteGate> {
  const [row] = await db
    .select({ gradeStatus: enrollments.gradeStatus })
    .from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.offeringId, offeringId)))
    .limit(1);
  if (row?.gradeStatus === 'FINALIZED') {
    return {
      ok: false,
      allowed: false,
      error: 'نمرهٔ این دانشجو قطعی شده است؛ برای تغییر آن درخواست بازگشایی ثبت کنید.',
    };
  }
  return { ok: true, allowed: true };
}

/**
 * مصرف درخواست بازگشایی تأییدشده (idempotent).
 * بعد از این، همان درخواست دیگر اجازهٔ نوشتن نمی‌دهد — پس یک تأیید = یک بار
 * بازگشایی، نه یک کارت اعتبار دائمی.
 */
export async function consumeUnfinalizeApproval(offeringId: number): Promise<boolean> {
  const res = await db
    .update(grade_unfinalize_requests)
    .set({ status: 'APPLIED' })
    .where(and(
      eq(grade_unfinalize_requests.offeringId, offeringId),
      eq(grade_unfinalize_requests.status, 'APPROVED'),
    ))
    .returning({ id: grade_unfinalize_requests.id });
  return res.length > 0;
}

/**
 * مسیر امن نوشتن نمره برای یک ارائه:
 *   اگر نهایی نشده → آزاد.
 *   اگر نهایی شده → فقط با درخواست تأییدشده، و در همان تراکنش مصرف می‌شود.
 *
 * این تابع را هر نویسنده‌ای که `gradeValue`/`gradeStatus` را تغییر می‌دهد
 * باید صدا بزند — به‌جای شرط‌های پراکنده که فقط در بعضی مسیرها بودند.
 */
export async function guardFinalizedGradeWrite(
  tx: Pick<typeof db, 'execute'>,
  offeringId: number,
  context: string,
): Promise<FinalizedWriteGate> {
  const gate = await assertGradeWriteAllowed(offeringId);
  if (!gate.ok) return gate;

  // اگر ارائه هنوز نهایی است ولی درخواست تأییدشده داریم (مثلاً تأیید ثبت شد و
  // بازگشایی در همان تراکنشِ تأیید انجام نشد)، خودمان باز می‌کنیم و درخواست
  // را مصرف می‌کنیم تا یک تأیید = یک بار بازگشایی باشد، نه کارت اعتبار دائمی.
  if (await isOfferingFinalized(offeringId)) {
    const consumed = await consumeUnfinalizeApproval(offeringId);
    if (!consumed) {
      return {
        ok: false,
        allowed: false,
        error: `${context}: درخواست بازگشایی نمره در همین لحظه مصرف شده است؛ دوباره تلاش کنید.`,
      };
    }
    await tx.execute(sql`
      UPDATE course_offerings
         SET "gradesFinalizedAt" = NULL, "gradesTemporaryAt" = ${new Date()}
       WHERE id = ${offeringId} AND "gradesFinalizedAt" IS NOT NULL`);
  }
  return { ok: true, allowed: true };
}


