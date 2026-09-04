/**
 * ═══════════════════════════════════════════════════════════════════════════
 * موتور چرخهٔ امتحانات (Exam Workflow Engine) — نسخهٔ PostgreSQL/Drizzle
 *
 * زنجیرهٔ «تحویل و دادرسی اوراق امتحان» (Chain of Custody):
 *
 *   ① صدور حضور و غیاب      → issueExamAttendance      (از صندلی‌های تخصیصی)
 *   ② بررسی مراقب           → proctorClockIn / proctorVerifyAttendance
 *   ③ امضای صورتجلسهٔ سالن   → signHallMinutes          (هش زنجیره‌ای)
 *   ④ تحویل به مخزن         → vaultReceiveHall / finalizeVaultHandover
 *   ⑤ تحویل به استاد        → deliverToInstructor       (توکن برداشت + مهلت)
 *   ⑥ ثبت نمرات             → submitExamGrades          (بارم‌بندی + قفل)
 *   ⑦ اعتراض                → openExamAppeal            (عکس‌برداری نمرهٔ قبلی)
 *   ⑧ پاسخ بر اساس بارم‌بندی → answerExamAppeal          (بازتصحیح + قواعد بارم)
 *
 *  اصول:
 *   - SQL امن: هیچ `sql.raw`ای روی ورودی کاربر وجود ندارد؛ VALUESها همه
 *     پارامتری‌اند و اعتبارسنجی ورودی‌ها در هستهٔ خالص `exam-core` (قابل تست واحد).
 *   - کوئری‌های دسته‌ای (batch) — تعداد کوئری با تعداد ردیف رشد نمی‌کند.
 *   - همزمانی: مراحل رقابتی با `pg_advisory_xact_lock` و ردیف‌های حساس با
 *     `FOR UPDATE` داخل تراکنش قفل می‌شوند (بدون double-count / duplicate).
 *   - هر رویداد زنجیرهٔ هش ممیزی (`audit-chain`) را امضا می‌کند.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import 'server-only';
import crypto from 'crypto';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  course_exam_sessions, course_offerings, enrollments,
  exam_attendances, exam_course_packets, exam_halls, exam_invigilators,
  exam_minutes, exam_sessions, grade_appeals, instructor_deliveries,
  invigilators, seat_allocations,
} from '@/db/schema';
import { getNumber } from '@/lib/settings';
import { createLogger } from '@/lib/logger';
import { auditChain, type AuditTx } from '@/lib/audit-chain';
import { decideAppealOutcome, scoreFromComponents, validateCheckIns } from '@/lib/exam-core';
import type { ExamCheckIn, ExamCheckInInput } from '@/lib/exam-core';
import type { RubricWeights } from '@/app/professor/grades/types';

export type { ExamCheckIn, ExamCheckInInput } from '@/lib/exam-core';

const log = createLogger({ mod: 'exam' });

// ─────────────────────────── انواع ───────────────────────────

export interface ExamGradeEntry {
  studentId: number;
  midtermScore?: number;      // از بارم: rubric.midterm
  finalExamScore?: number;    // از بارم: rubric.finalExam
}

export interface ExamAppealRecheck {
  midtermScore?: number;
  finalExamScore?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** VALUES چندردیفی کاملاً پارامتری — هرگز روی ورودی کاربر sql.raw نمی‌شود */
function valuesSql(rows: ReturnType<typeof sql>[]): ReturnType<typeof sql.join> {
  return sql.join(rows, sql`, `);
}

/** قفل توافقی (advisory) برای مراحل رقابتی — تا پایان تراکنش نگه داشته می‌شود */
async function advisoryLock(tx: AuditTx, ns: string, a: number, b = 0) {
  // کلید ۶۴ بیتی بدون overflow (برخلاف ضرب در ۱۰۰۰۰ که برای شناسه‌های بزرگ سرریز می‌شود)
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${ns}:${a}:${b}`}, 0))`);
}

// ─────────────────────────── مرحلهٔ ۱: صدور حضور و غیاب ───────────────────────────

/**
 * صدور حضور و غیاب: از صندلی‌های تخصیص‌یافتهٔ جلسه، ردیف حضور و غیاب برای
 * همهٔ دانشجویان ساخته می‌شود (isPresent=0، شمای QR). idempotent و race-safe
 * (قفل توافقی روی جلسه — دو فراخوانی همزمان نمی‌توانند ردیف تکراری بسازند).
 */
export async function issueExamAttendance(actorUserId: number | null, sessionId: number) {
  const [sess] = await db.select().from(exam_sessions).where(eq(exam_sessions.id, sessionId)).limit(1);
  if (!sess) throw new Error('جلسهٔ امتحان یافت نشد.');

  return db.transaction(async tx => {
    await advisoryLock(tx, 'exam_attendance', sessionId);

    const [existing] = await tx
      .select({ n: count() })
      .from(exam_attendances)
      .where(eq(exam_attendances.examId, sessionId));
    if (Number(existing?.n ?? 0) > 0) {
      return { ok: true, issued: 0, skipped: Number(existing!.n), reason: 'ALREADY_ISSUED' } as const;
    }

    // ۱) درج دسته‌ای از صندلی‌ها (نه به‌ازای هر دانشجو یک کوئری)
    const ins = await tx.execute(sql`
      insert into exam_attendances ("examId", "studentId", "isPresent", "checkInMethod", "hasTemporaryPermit", "createdAt")
      select ${sessionId}, e."studentId", 0, 'QR_SCAN', 0, now()
      from seat_allocations sa
      join enrollments e on e.id = sa."enrollmentId"
      where sa."sessionId" = ${sessionId}
    `);

    // ۲) سقف برگهٔ مورد انتظار هر بستهٔ درس
    await tx.execute(sql`
      update exam_course_packets p
      set "expectedSheetCount" = x.n
      from (
        select co."courseId" as cid, count(*) as n
        from seat_allocations sa
        join enrollments e on e.id = sa."enrollmentId"
        join course_offerings co on co.id = e."offeringId"
        where sa."sessionId" = ${sessionId}
        group by co."courseId"
      ) x
      where p."examId" = ${sessionId} and p."courseId" = x.cid
    `);

    const issued = Number(ins.rowCount ?? 0);
    await auditChain(tx, actorUserId, 'EXAM_ATTENDANCE_ISSUED', 'exam_session', sessionId, { issued });
    log.info('exam_attendance_issued', { sessionId, issued });
    return { ok: true, issued, skipped: 0 } as const;
  });
}

// ─────────────────────────── مرحلهٔ ۲: بررسی مراقب ───────────────────────────

/**
 * ثبت ساعت ورود مراقبان (به‌صورت دسته‌ای) — فقط مراقبانِ تخصیص‌یافتهٔ همین جلسه.
 * زیر قفل توافقی: دو درخواست هم‌زمان نمی‌توانند ردیف را دوباره «به‌روز» کنند
 * (گارد clockInTime is null) و رویداد ممیزی فقط ۱ بار ثبت می‌شود.
 */
export async function proctorClockIn(actorUserId: number | null, sessionId: number, staffIds: number[]) {
  if (!staffIds.length) throw new Error('مراقبی برای ثبت ورود داده نشده است.');
  const assigned = await db
    .select({ staffId: exam_invigilators.staffId })
    .from(exam_invigilators)
    .where(and(eq(exam_invigilators.examId, sessionId), inArray(exam_invigilators.staffId, staffIds)));
  if (assigned.length !== staffIds.length) {
    throw new Error(`${staffIds.length - assigned.length} مراقب در این جلسه تخصیص نیافته است.`);
  }
  return db.transaction(async tx => {
    await advisoryLock(tx, 'exam_clockin', sessionId);
    const upd = await tx
      .update(exam_invigilators)
      .set({ clockInTime: new Date() })
      .where(and(
        eq(exam_invigilators.examId, sessionId),
        inArray(exam_invigilators.staffId, staffIds),
        sql`${exam_invigilators.clockInTime} is null`,
      ));
    const n = Number(upd.rowCount ?? 0);
    if (n > 0) {
      await auditChain(tx, actorUserId, 'EXAM_PROCTOR_CLOCKED_IN', 'exam_session', sessionId, { staffIds });
    }
    return { ok: true, clockedIn: n };
  });
}

/**
 * بررسی حضور و غیاب توسط مراقب سالن: همهٔ دانشجویان یک سالن در یک کوئری
 * (VALUES کاملاً پارامتری). هر دانشجو باید در همان سالن نشسته باشد و مراقب
 * باید به همان سالن تخصیص یافته باشد. ورودی‌ها اول در هستهٔ خالص اعتبارسنجی
 * می‌شوند (وایت‌لیست method + اعداد) — هیچ رشته‌ای به SQL نمی‌رسد.
 */
export async function proctorVerifyAttendance(
  actorUserId: number | null,
  px: { sessionId: number; hallId: number; proctorStaffId: number; checkIns: ExamCheckInInput[] },
) {
  const { sessionId, hallId, proctorStaffId, checkIns: raw } = px;
  const checkIns = validateCheckIns(raw); // ← خط اول دفاع (تست‌شده در exam-core)

  const assigned = await db
    .select({ id: invigilators.id })
    .from(invigilators)
    .where(and(
      eq(invigilators.sessionId, sessionId),
      eq(invigilators.hallId, hallId),
      eq(invigilators.staffId, proctorStaffId),
    ))
    .limit(1);
  if (!assigned.length) throw new Error('این مراقب به این سالن در این جلسه تخصیص نیافته است.');

  const vals = valuesSql(checkIns.map(c => sql`(${c.studentId}::int, ${c.isPresent}::int, ${c.method}::text, ${c.hasTemporaryPermit ?? 0}::int)`));
  const upd = await db.execute(sql`
    update exam_attendances a set
      "isPresent" = v.is_present,
      "checkInMethod" = v.method,
      "hasTemporaryPermit" = v.temp,
      "verifiedByStaffId" = ${proctorStaffId},
      "checkInTime" = case when v.is_present = 1 then now() else null end
    from (values ${vals}) as v("studentId", "is_present", "method", "temp")
    where a."examId" = ${sessionId}
      and a."studentId" = v."studentId"
      and a."studentId" in (
        select e."studentId"
        from seat_allocations sa
        join enrollments e on e.id = sa."enrollmentId"
        where sa."sessionId" = ${sessionId} and sa."hallId" = ${hallId}
      )
  `);

  await db.transaction(async tx => {
    await auditChain(tx, actorUserId, 'EXAM_ATTENDANCE_VERIFIED', 'exam_hall', hallId, {
      sessionId, proctorStaffId, count: Number(upd.rowCount ?? 0),
    });
  });

  return { ok: true, verified: Number(upd.rowCount ?? 0) };
}

// ─────────────────────────── مرحلهٔ ۳: امضای صورتجلسهٔ سالن ───────────────────────────

/**
 * صورتجلسهٔ سالن: جمع حضور/غیاب + هش زنجیره‌ای روی همهٔ ردیف‌های حضور و غیاب
 * سالن (summaryHash) + امضای نهایی. فقط مراقبِ تخصیص‌یافتهٔ همان سالن امضا
 * می‌کند؛ بدون امضای این صورتجلسه، مخزن تحویل نمی‌گیرد. upsert زیر قفل
 * توافقی است تا دو امضای همزمان ردیف تکراری نسازند.
 */
export async function signHallMinutes(
  actorUserId: number | null,
  px: { sessionId: number; hallId: number; supervisorStaffId: number; notes?: string; cheatingIncidentsCount?: number },
) {
  const { sessionId, hallId, supervisorStaffId, notes } = px;
  const [hall] = await db.select().from(exam_halls).where(eq(exam_halls.id, hallId)).limit(1);
  if (!hall) throw new Error('سالن یافت نشد.');
  // فقط مراقبِ تخصیص‌یافته به همین سالن می‌تواند صورتجلسه را امضا کند
  const [sup] = await db
    .select({ id: invigilators.id })
    .from(invigilators)
    .where(and(
      eq(invigilators.sessionId, sessionId),
      eq(invigilators.hallId, hallId),
      eq(invigilators.staffId, supervisorStaffId),
    ))
    .limit(1);
  if (!sup) throw new Error('این مراقب به این سالن در این جلسه تخصیص نیافته است.');

  const totalsResult = await db.execute(sql`
    select
      count(*) filter (where a."isPresent" = 1) as present,
      count(*) filter (where a."isPresent" = 0) as absent,
      count(*) as total
    from exam_attendances a
    join enrollments e on e."studentId" = a."studentId"
    join seat_allocations sa on sa."enrollmentId" = e.id
    where a."examId" = ${sessionId} and sa."hallId" = ${hallId}
  `);

  // ردیف‌های سالن برای هش زنجیره‌ای (مرتب، تا هش پایدار بماند)
  const rows = await db.execute(sql`
    select a."studentId", a."isPresent", a."checkInMethod", a."hasTemporaryPermit"
    from exam_attendances a
    join enrollments e on e."studentId" = a."studentId"
    join seat_allocations sa on sa."enrollmentId" = e.id
    where a."examId" = ${sessionId} and sa."hallId" = ${hallId}
    order by a."studentId"
  `);
  const summaryHash = crypto
    .createHash('sha256')
    .update((rows.rows as unknown[]).map(r => JSON.stringify(r)).join('|'))
    .digest('hex');

  const present = Number(totalsResult.rows[0]?.present ?? 0);
  const absent = Number(totalsResult.rows[0]?.absent ?? 0);
  const total = Number(totalsResult.rows[0]?.total ?? 0);

  await db.transaction(async tx => {
    await advisoryLock(tx, 'exam_minutes', sessionId, hallId);
    const existing = await tx
      .select({ id: exam_minutes.id })
      .from(exam_minutes)
      .where(and(eq(exam_minutes.sessionId, sessionId), eq(exam_minutes.hallId, hallId)))
      .limit(1);
    if (existing.length) {
      await tx
        .update(exam_minutes)
        .set({
          totalStudentsExpected: total,
          totalStudentsPresent: present,
          totalStudentsAbsent: absent,
          cheatingIncidentsCount: px.cheatingIncidentsCount ?? 0,
          supervisorStaffId,
          isSignedAndFinalized: 1,
          signedAt: new Date(),
          notes: notes ?? null,
          summaryHash,
        })
        .where(eq(exam_minutes.id, existing[0].id));
    } else {
      await tx.insert(exam_minutes).values({
        sessionId, hallId,
        totalStudentsExpected: total,
        totalStudentsPresent: present,
        totalStudentsAbsent: absent,
        cheatingIncidentsCount: px.cheatingIncidentsCount ?? 0,
        supervisorStaffId,
        isSignedAndFinalized: 1,
        signedAt: new Date(),
        notes: notes ?? null,
        summaryHash,
      });
    }
    await auditChain(tx, actorUserId, 'EXAM_MINUTES_SIGNED', 'exam_hall', hallId, {
      sessionId, present, absent, total, summaryHash,
    });
  });

  return { ok: true, hallId, present, absent, total, summaryHash };
}

// ─────────────────────────── مرحلهٔ ۴: تحویل به مخزن ───────────────────────────

/**
 * تحویل برگه‌های یک سالن به مخزن: فقط پس از امضای صورتجلسه (گلوگاه سخت‌گیرانه).
 * شمارش برگه = دانشجویان حاضر; به تفکیک هر درس، شمارش تجمیعیِ course_exam_sessions
 * به‌روز می‌شود (receivedHallsCount++ و totalDeliveredSheets += برگه‌های این سالن).
 * **exactly-once:** ردیف صورتجلسه با FOR UPDATE قفل می‌شود و اگر
 * vaultReceivedAt پر باشد یعنی این سالن قبلاً تحویل شده — هیچ شمارشگری دوباره
 * زیاد نمی‌شود (دو درخواست هم‌زمان نمی‌توانند double-count کنند).
 */
export async function vaultReceiveHall(
  actorUserId: number | null,
  px: { sessionId: number; hallId: number; vaultManagerId: number },
) {
  const { sessionId, hallId, vaultManagerId } = px;
  const [minutes] = await db
    .select({ id: exam_minutes.id, isSignedAndFinalized: exam_minutes.isSignedAndFinalized })
    .from(exam_minutes)
    .where(and(eq(exam_minutes.sessionId, sessionId), eq(exam_minutes.hallId, hallId)))
    .limit(1);
  if (!minutes?.isSignedAndFinalized) {
    throw new Error(`گلوگاه مخزن: صورتجلسهٔ سالن ${hallId} هنوز امضا نشده است.`);
  }

  const perCourse = await db.execute(sql`
    select co."id" as offeringId,
           count(*) filter (where a."isPresent" = 1) as sheets
    from seat_allocations sa
    join enrollments e on e.id = sa."enrollmentId"
    join course_offerings co on co.id = e."offeringId"
    left join exam_attendances a on a."examId" = sa."sessionId" and a."studentId" = e."studentId"
    where sa."sessionId" = ${sessionId} and sa."hallId" = ${hallId}
    group by co."id"
  `);

  return db.transaction(async tx => {
    await advisoryLock(tx, 'exam_vault', sessionId, hallId);
    const [m] = await tx
      .select({ id: exam_minutes.id, vaultReceivedAt: exam_minutes.vaultReceivedAt })
      .from(exam_minutes)
      .where(and(eq(exam_minutes.sessionId, sessionId), eq(exam_minutes.hallId, hallId)))
      .limit(1)
      .for('update');
    if (!m) throw new Error(`گلوگاه مخزن: صورتجلسهٔ سالن ${hallId} یافت نشد.`);
    if (m.vaultReceivedAt) {
      // قبلاً تحویل شده — idempotent: هیچ شمارشی دوباره اضافه نمی‌شود
      return { ok: true, alreadyReceived: true, hallId, sheetsByCourse: [] };
    }
    await tx
      .update(exam_minutes)
      .set({ vaultReceivedAt: new Date() })
      .where(eq(exam_minutes.id, m.id));

    const vals = valuesSql((perCourse.rows as { offeringid: number; sheets: string }[])
      .map(r => sql`(${Number(r.offeringid)}::int, ${Number(r.sheets)}::int)`));
    await tx.execute(sql`
      update course_exam_sessions ces set
        "receivedHallsCount" = ces."receivedHallsCount" + 1,
        "totalDeliveredSheets" = ces."totalDeliveredSheets" + v.sheets
      from (values ${vals}) as v("offeringId", "sheets")
      where ces."courseOfferingId" = v."offeringId"
    `);
    await auditChain(tx, actorUserId, 'EXAM_VAULT_RECEIVED_HALL', 'exam_hall', hallId, {
      sessionId, vaultManagerId, sheets: Number((perCourse.rows as { sheets: string }[]).reduce((s, r) => s + Number(r.sheets), 0)),
    });
    return { ok: true, hallId, sheetsByCourse: perCourse.rows };
  });
}

/**
 * تکمیل تحویل به مخزن: بسته‌های هر درس پایانی می‌شوند (RECEIVED_BY_VAULT یا
 * DISCREPANCY)، و درس‌هایی که برگه‌شان از همهٔ سالن‌ها رسیده است fully collected
 * می‌شوند. (زیر قفل توافقی — نهایی‌سازی همزمان با تحویل سالن‌ها تداخل ندارد.)
 */
export async function finalizeVaultHandover(actorUserId: number | null, sessionId: number, vaultManagerId: number) {
  // برگهٔ واقعی هر بسته = تعداد حاضرِ همان درس در کل جلسه
  const counts = await db.execute(sql`
    select co."courseId" as cid, count(*) filter (where a."isPresent" = 1) as sheets
    from seat_allocations sa
    join enrollments e on e.id = sa."enrollmentId"
    join course_offerings co on co.id = e."offeringId"
    left join exam_attendances a on a."examId" = sa."sessionId" and a."studentId" = e."studentId"
    where sa."sessionId" = ${sessionId}
    group by co."courseId"
  `);

  const result = await db.transaction(async tx => {
    await advisoryLock(tx, 'exam_finalize', sessionId);
    const vals = valuesSql((counts.rows as { cid: number; sheets: string }[])
      .map(r => sql`(${Number(r.cid)}::int, ${Number(r.sheets)}::int)`));
    const upd = await tx.execute(sql`
      update exam_course_packets p set
        "actualDeliveredCount" = v.sheets,
        "handoverStatus" = case when p."expectedSheetCount" = v.sheets then 'RECEIVED_BY_VAULT' else 'DISCREPANCY' end,
        "receivedByVaultManagerId" = ${vaultManagerId},
        "handoverCompletedAt" = now(),
        "discrepancyNote" = case when p."expectedSheetCount" <> v.sheets then
          'تعداد برگهٔ دریافتی (' || v.sheets || ') با برگهٔ مورد انتظار (' || p."expectedSheetCount" || ') مغایرت دارد.' end
      from (values ${vals}) as v("cid", "sheets")
      where p."examId" = ${sessionId} and p."courseId" = v.cid
    `);

    // درس‌های کاملاً جمع‌آوری‌شده (همهٔ سالن‌ها تحویل داده‌اند)
    const collected = await tx
      .update(course_exam_sessions)
      .set({ isFullyCollected: 1, notificationSentAt: new Date() })
      .where(sql`"isFullyCollected" = 0 and "receivedHallsCount" >= "totalHallsCount"`)
      .returning({ id: course_exam_sessions.id });

    const discrepancyResult = await tx.execute(sql`
      select count(*) as n from exam_course_packets
      where "examId" = ${sessionId} and "handoverStatus" = 'DISCREPANCY'
    `);
    const discrepancies = Number(discrepancyResult.rows[0]?.n ?? 0);
    await auditChain(tx, actorUserId, 'EXAM_VAULT_FINALIZED', 'exam_session', sessionId, {
      vaultManagerId,
      packets: Number(upd.rowCount ?? 0),
      fullyCollected: collected.length,
      discrepancies,
    });
    return { packets: Number(upd.rowCount ?? 0), fullyCollected: collected.length, discrepancies };
  });

  return { ok: true, ...result };
}

// ─────────────────────────── مرحلهٔ ۵: تحویل به استاد ───────────────────────────

/**
 * تحویل اوراق به استاد: مهلت نمره‌دهی (gradeDeadline) از تنظیمات خوانده می‌شود؛
 * توکن برداشت یکتا تولید و تحویل در instructor_deliveries ثبت می‌شود.
 * گلوگاه: فقط درس‌هایی که fully collected شده‌اند قابل تحویل‌اند؛
 * چک «تحویل فعالِ تکراری» داخل تراکنش + قفل توافقی (بدون duplicate در race).
 */
export async function deliverToInstructor(
  actorUserId: number | null,
  px: { offeringId: number; instructorId: number; vaultManagerId: number },
) {
  const { offeringId, instructorId, vaultManagerId } = px;
  const deadlineDays = await getNumber('EXAM_GRADE_DEADLINE_DAYS', 5);

  const [row] = await db
    .select({
      offeringId: course_offerings.id,
      professorId: course_offerings.professorId,
      fullyCollected: course_exam_sessions.isFullyCollected,
      totalDeliveredSheets: course_exam_sessions.totalDeliveredSheets,
    })
    .from(course_offerings)
    .leftJoin(course_exam_sessions, eq(course_exam_sessions.courseOfferingId, course_offerings.id))
    .where(eq(course_offerings.id, offeringId))
    .limit(1);
  if (!row) throw new Error('ارائهٔ درس یافت نشد.');
  if (row.professorId !== instructorId) throw new Error('این استاد، استاد این درس نیست.');
  if (!row.fullyCollected) throw new Error(`گلوگاه تحویل: اوراق درس هنوز جمع‌آوری (fully collected) نشده است.`);

  const pickupToken = crypto.randomBytes(32).toString('hex');
  const gradeDeadline = new Date(Date.now() + deadlineDays * 86400_000);
  const sheetCount = Number(row.totalDeliveredSheets ?? 0);

  const result = await db.transaction(async tx => {
    await advisoryLock(tx, 'exam_delivery', offeringId);
    const [activeDelivery] = await tx
      .select({ id: instructor_deliveries.id, status: instructor_deliveries.status })
      .from(instructor_deliveries)
      .where(and(
        eq(instructor_deliveries.courseOfferingId, offeringId),
        sql`${instructor_deliveries.status} <> 'ARCHIVED'`,
      ))
      .limit(1);
    if (activeDelivery) {
      return { ok: false as const, reason: 'ALREADY_DELIVERED' as const, status: activeDelivery.status, deliveryId: activeDelivery.id };
    }
    const [delivery] = await tx
      .insert(instructor_deliveries)
      .values({
        courseOfferingId: offeringId,
        instructorId,
        sheetCount,
        pickupToken,
        deliveredAt: new Date(),
        vaultManagerId,
        gradeDeadline,
        status: 'PENDING_GRADING',
      })
      .returning({ id: instructor_deliveries.id });
    await auditChain(tx, actorUserId, 'EXAM_DELIVERED_TO_INSTRUCTOR', 'instructor_delivery', delivery.id, {
      offeringId, instructorId, sheetCount, gradeDeadline: gradeDeadline.toISOString(),
    });
    return { ok: true as const, deliveryId: delivery.id, pickupToken, sheetCount, gradeDeadline };
  });

  return result;
}

// ─────────────────────────── مرحلهٔ ۶: ثبت نمرات (بارم‌بندی) ───────────────────────────

/**
 * ثبت نمرات توسط استاد: هر نمرهٔ جزئی به سقف بارم کلمپ می‌شود (۰..بارم)، نمرهٔ
 * نهایی از هستهٔ بارم‌بندی محاسبه و در enrollments با وضعیت FINALIZED ثبت می‌شود؛
 * hash نمرات درس + زمان قفل روی course_offerings می‌نشیند و تحویل به
 * GRADES_SUBMITTED می‌رود. همهٔ دانشجویان درس در یک کوئری (upsert دسته‌ای).
 * ردیف تحویل با FOR UPDATE قفل می‌شود — دو ثبت همزمان نمی‌توانند هم‌زمان
 * از یک تحویل نمره ثبت کنند (state transition امن).
 */
export async function submitExamGrades(
  actorUserId: number | null,
  px: { offeringId: number; instructorId: number; rubric: RubricWeights; entries: ExamGradeEntry[] },
) {
  const { offeringId, instructorId, rubric, entries } = px;
  if (!entries.length) throw new Error('ردیف نمره‌ای ارسال نشده است.');

  return db.transaction(async tx => {
    const [delivery] = await tx
      .select({
        id: instructor_deliveries.id,
        status: instructor_deliveries.status,
        instructorId: instructor_deliveries.instructorId,
      })
      .from(instructor_deliveries)
      .where(eq(instructor_deliveries.courseOfferingId, offeringId))
      .orderBy(desc(instructor_deliveries.id))
      .limit(1)
      .for('update');
    if (!delivery) throw new Error('گلوگاه ثبت نمره: اوراق این درس هنوز به استاد تحویل نشده است.');
    if (delivery.instructorId !== instructorId) throw new Error('این استاد مجاز به نمره‌دهی این درس نیست.');
    if (delivery.status !== 'PENDING_GRADING') throw new Error(`وضعیت تحویل «${delivery.status}» اجازهٔ ثبت نمره نمی‌دهد.`);

    await tx
      .insert(enrollments)
      .values(entries.map(e => {
        const total = round2(scoreFromComponents(
          { midtermScore: e.midtermScore, finalExamScore: e.finalExamScore }, rubric,
        ));
        if (!Number.isFinite(e.midtermScore ?? 0) || !Number.isFinite(e.finalExamScore ?? 0)) {
          throw new Error('نمرهٔ نامعتبر در ردیف ثبت نمره.');
        }
        return {
          studentId: e.studentId,
          offeringId,
          status: 'REGISTERED' as const,
          gradeValue: String(total),
          gradeStatus: 'FINALIZED' as const,
        };
      }))
      .onConflictDoUpdate({
        target: [enrollments.studentId, enrollments.offeringId],
        set: { gradeValue: sql`excluded."gradeValue"`, gradeStatus: sql`excluded."gradeStatus"` },
      });

    // hash نمرات درس برای راستی‌آزمایی
    const graded = await tx
      .select({ studentId: enrollments.studentId, gradeValue: enrollments.gradeValue })
      .from(enrollments)
      .where(eq(enrollments.offeringId, offeringId));
    const gradesHash = crypto
      .createHash('sha256')
      .update(graded.map(g => `${g.studentId}:${g.gradeValue}`).sort().join('|'))
      .digest('hex');

    await tx
      .update(course_offerings)
      .set({ gradesHash, gradesFinalizedAt: new Date() })
      .where(eq(course_offerings.id, offeringId));
    await tx
      .update(instructor_deliveries)
      .set({ status: 'GRADES_SUBMITTED' })
      .where(eq(instructor_deliveries.id, delivery.id));

    await auditChain(tx, actorUserId, 'EXAM_GRADES_SUBMITTED', 'course_offering', offeringId, {
      count: entries.length, gradesHash, deliveryId: delivery.id,
    });

    log.info('exam_grades_submitted', { offeringId, count: entries.length });
    return { ok: true, count: entries.length, gradesHash };
  });
}

// ─────────────────────────── مرحلهٔ ۷: اعتراض ───────────────────────────

/**
 * اعتراض دانشجو — نمرهٔ قبلی در همان لحظه عکس‌برداری می‌شود (oldGrade).
 * فقط روی نمرهٔ FINALIZED؛ بررسی «اعتراض باز» داخل تراکنش زیر قفل توافقیِ
 * ثبت‌نام انجام می‌شود تا دو درخواست هم‌زمان دو اعتراضِ باز نسازند.
 */
export async function openExamAppeal(actorUserId: number | null, px: { enrollmentId: number; studentMessage: string }) {
  return db.transaction(async tx => {
    await advisoryLock(tx, 'exam_appeal', px.enrollmentId);
    const [enr] = await tx
      .select({
        id: enrollments.id,
        gradeValue: enrollments.gradeValue,
        gradeStatus: enrollments.gradeStatus,
      })
      .from(enrollments)
      .where(eq(enrollments.id, px.enrollmentId))
      .limit(1)
      .for('update');
    if (!enr) throw new Error('ثبت‌نام یافت نشد.');
    if (enr.gradeStatus !== 'FINALIZED') throw new Error('اعتراض فقط پس از قطعی‌شدن نمره ممکن است.');

    const [open] = await tx
      .select({ id: grade_appeals.id })
      .from(grade_appeals)
      .where(and(eq(grade_appeals.enrollmentId, px.enrollmentId), eq(grade_appeals.status, 'OPEN')))
      .limit(1);
    if (open) throw new Error('برای این درس هم‌اکنون یک اعتراض باز دارید.');

    const [a] = await tx
      .insert(grade_appeals)
      .values({
        enrollmentId: px.enrollmentId,
        studentMessage: px.studentMessage,
        oldGrade: enr.gradeValue,
        status: 'OPEN',
      })
      .returning({ id: grade_appeals.id });
    await auditChain(tx, actorUserId, 'EXAM_APPEAL_OPENED', 'grade_appeal', a.id, {
      enrollmentId: px.enrollmentId, oldGrade: enr.gradeValue,
    });
    return { ok: true, appealId: a.id, oldGrade: enr.gradeValue };
  });
}

// ─────────────────────────── مرحلهٔ ۸: پاسخ به اعتراض بر اساس بارم‌بندی ───────────────────────────

/**
 * پاسخ استاد به اعتراض: استاد برگه را بر اساس بارم دوباره تصحیح می‌کند
 * (مقادیر جزئی جدید)؛ نمرهٔ نهایی از هستهٔ بارم‌بندی محاسبه می‌شود (کلمپ به
 * سقف بارم). اگر نمره تغییر کند → RESOLVED_ACCEPTED و به‌روزرسانی نمرهٔ
 * ثبت‌نام؛ در غیر این صورت REJECTED. نمره هرگز از بارم و از ۲۰ بالاتر نمی‌رود.
 * ردیف اعتراض با FOR UPDATE قفل می‌شود — دو پاسخ همزمان غیرممکن است.
 */
export async function answerExamAppeal(
  actorUserId: number | null,
  px: {
    appealId: number;
    professorReply: string;
    rubric: RubricWeights;
    recheck: ExamAppealRecheck;
    /** هویت استاد پاسخ‌دهنده — باید استاد همان درس باشد (مالکیت) */
    staffId: number;
  },
) {
  const { appealId, professorReply, rubric, recheck, staffId } = px;

  return db.transaction(async tx => {
    const [appeal] = await tx
      .select({
        id: grade_appeals.id,
        enrollmentId: grade_appeals.enrollmentId,
        oldGrade: grade_appeals.oldGrade,
        status: grade_appeals.status,
        offeringId: enrollments.offeringId,
        professorId: course_offerings.professorId,
      })
      .from(grade_appeals)
      .innerJoin(enrollments, eq(enrollments.id, grade_appeals.enrollmentId))
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .where(eq(grade_appeals.id, appealId))
      .limit(1)
      .for('update');
    if (!appeal) throw new Error('اعتراض یافت نشد.');
    if (appeal.status !== 'OPEN') throw new Error('این اعتراض قبلاً پاسخ داده شده است.');
    if (Number(appeal.professorId) !== Number(staffId)) {
      throw new Error('مالکیت: فقط استاد همین درس می‌تواند به این اعتراض پاسخ دهد.');
    }

    const [enr] = await tx
      .select({ gradeValue: enrollments.gradeValue })
      .from(enrollments)
      .where(eq(enrollments.id, appeal.enrollmentId))
      .limit(1);

    const newTotal = round2(scoreFromComponents(
      { midtermScore: recheck.midtermScore, finalExamScore: recheck.finalExamScore }, rubric,
    ));
    const oldGrade = round2(Number(appeal.oldGrade ?? enr?.gradeValue ?? 0));
    const { changed, status } = decideAppealOutcome(oldGrade, newTotal);

    if (changed) {
      await tx
        .update(enrollments)
        .set({ gradeValue: String(newTotal) })
        .where(eq(enrollments.id, appeal.enrollmentId));
    }
    await tx
      .update(grade_appeals)
      .set({ professorReply, newGrade: String(newTotal), status })
      .where(eq(grade_appeals.id, appealId));

    await auditChain(tx, actorUserId, 'EXAM_APPEAL_RESOLVED', 'grade_appeal', appealId, {
      enrollmentId: appeal.enrollmentId, oldGrade, newGrade: newTotal, status,
    });

    return { ok: true, status, oldGrade, newGrade: newTotal, changed };
  });
}

// ─────────────────────────── نمای کلی چرخه (برای تست و داشبورد) ───────────────────────────

export async function examChainOverview(sessionId: number) {
  const [attendance] = await db
    .select({ issued: count() })
    .from(exam_attendances)
    .where(eq(exam_attendances.examId, sessionId));
  const [present] = await db
    .select({ n: count() })
    .from(exam_attendances)
    .where(and(eq(exam_attendances.examId, sessionId), eq(exam_attendances.isPresent, 1)));
  const [minutes] = await db
    .select({ n: count() })
    .from(exam_minutes)
    .where(and(eq(exam_minutes.sessionId, sessionId), eq(exam_minutes.isSignedAndFinalized, 1)));
  const packets = await db
    .select({ handoverStatus: exam_course_packets.handoverStatus, n: count() })
    .from(exam_course_packets)
    .where(eq(exam_course_packets.examId, sessionId))
    .groupBy(exam_course_packets.handoverStatus);
  const [collected] = await db
    .select({ n: count() })
    .from(course_exam_sessions)
    .where(eq(course_exam_sessions.isFullyCollected, 1));
  const deliveries = await db
    .select({ status: instructor_deliveries.status, n: count() })
    .from(instructor_deliveries)
    .groupBy(instructor_deliveries.status);
  const [finalized] = await db
    .select({ n: count() })
    .from(enrollments)
    .where(and(eq(enrollments.gradeStatus, 'FINALIZED'), inArray(enrollments.offeringId,
      db.select({ id: course_offerings.id }).from(course_offerings).where(eq(course_offerings.termId,
        db.select({ termId: exam_sessions.termId }).from(exam_sessions).where(eq(exam_sessions.id, sessionId))
      ))
    )));
  const appeals = await db
    .select({ status: grade_appeals.status, n: count() })
    .from(grade_appeals)
    .groupBy(grade_appeals.status);

  return {
    sessionId,
    attendanceIssued: Number(attendance?.issued ?? 0),
    present: Number(present?.n ?? 0),
    absent: Number(attendance?.issued ?? 0) - Number(present?.n ?? 0),
    minutesSigned: Number(minutes?.n ?? 0),
    packets: Object.fromEntries(packets.map(p => [p.handoverStatus ?? 'NULL', Number(p.n)])),
    coursesFullyCollected: Number(collected?.n ?? 0),
    deliveries: Object.fromEntries(deliveries.map(d => [d.status, Number(d.n)])),
    gradesFinalized: Number(finalized?.n ?? 0),
    appeals: Object.fromEntries(appeals.map(a => [a.status, Number(a.n)])),
  };
}
