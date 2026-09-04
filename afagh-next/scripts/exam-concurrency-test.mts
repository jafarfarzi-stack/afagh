/**
 * تست همزمانی (Concurrency) گلوگاه‌های چرخهٔ امتحانات
 *
 * هدف: اثبات اینکه قفل‌های توافقی (advisory) و FOR UPDATE واقعاً جلوی
 * duplicate/double-count را در رقابت هم‌زمان می‌گیرند:
 *   ۳) امضای صورتجلسه ×۵ هم‌زمان  → دقیقاً ۱ ردیف صورتجلسه
 *   ۴) تحویل مخزن سالن ×۵ هم‌زمان  → شمارندهٔ درس دقیقاً ۱ بار +۱ می‌شود
 *   ۵) تحویل به استاد ×۵ هم‌زمان   → دقیقاً ۱ تحویل فعال
 *   ۶) ثبت نمرات ×۵ هم‌زمان        → دقیقاً ۱ بار موفق (state gate)
 *
 * اجرا:  DATABASE_URL=… npx tsx --conditions=react-server scripts/exam-concurrency-test.mts
 *  (باید بعد از seed تمیز اجرا شود)
 */
import pg from 'pg';

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }
process.env.LOG_LEVEL = 'warn';

const engine = await import('../src/lib/exam-engine.ts');
const { db } = await import('../src/db/index.ts');
const { sql } = await import('drizzle-orm');

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

const [term] = (await db.execute(sql`SELECT id FROM academic_terms WHERE "termCode"='EXAM-1405'`)).rows;
if (!term) { console.error('❌ seed نیست.'); process.exit(2); }
const [sess] = (await db.execute(sql`SELECT id FROM exam_sessions WHERE "termId"=${term.id} LIMIT 1`)).rows;
const hallIds = (await db.execute(sql`SELECT id FROM exam_halls WHERE name LIKE 'سالن-EX%' ORDER BY name`)).rows.map(r => r.id);
const proctors = (await db.execute(sql`SELECT "staffId", "hallId", "role" FROM invigilators WHERE "sessionId"=${sess.id}`)).rows;
const offerings = (await db.execute(sql`SELECT o.id, o."professorId" FROM course_offerings o JOIN courses c ON c.id=o."courseId" WHERE o."termId"=${term.id} AND c.code LIKE 'EX-%' ORDER BY o.id`)).rows;

console.log(`جلسه ${sess.id} · ${hallIds.length} سالن · ${offerings.length} درس`);
const RUBRIC = { midterm: 8, homework: 0, participation: 0, practical: 0, finalExam: 12 };

// ── پیش‌آماده‌سازی: حضور و غیاب + بررسیِ کاملِ هر سالن (برای امضا و مخزن) ──
await engine.issueExamAttendance(null, Number(sess.id));
const rosterByHall = new Map();
for (const hid of hallIds) {
  const roster = (await db.execute(sql`
    SELECT e."studentId" FROM seat_allocations sa JOIN enrollments e ON e.id=sa."enrollmentId"
    WHERE sa."sessionId"=${sess.id} AND sa."hallId"=${hid}
  `)).rows;
  rosterByHall.set(Number(hid), roster);
  const sup = proctors.find((p: any) => Number(p.hallId) === Number(hid));
  // غیبت فقط ۱ نفر هر سالن (اولین ردیف) تا برخورد قطعی با چیدمان صندلی‌ها نشود
  await engine.proctorVerifyAttendance(null, {
    sessionId: Number(sess.id), hallId: Number(hid), proctorStaffId: Number(sup.staffId),
    checkIns: roster.map((r: any, i: number) => ({ studentId: Number(r.studentId), isPresent: i === 0 ? 0 : 1, method: 'QR_SCAN' })),
  });
}

// ═══ ۳) امضای هم‌زمان صورتجلسه ×۵ (سالن ۱) ═══
console.log('\n③ امضای هم‌زمان صورتجلسه (۵ موازی):');
const sup1 = proctors.find((p: any) => Number(p.hallId) === Number(hallIds[0]));
const signResults = await Promise.allSettled(Array.from({ length: 5 }, () =>
  engine.signHallMinutes(null, { sessionId: Number(sess.id), hallId: Number(hallIds[0]), supervisorStaffId: Number(sup1.staffId), notes: 'conc' }),
));
const minutesCount = (await db.execute(sql`SELECT count(*) n FROM exam_minutes WHERE "sessionId"=${sess.id} AND "hallId"=${hallIds[0]}`)).rows[0].n;
eq('همهٔ ۵ امضا موفق', signResults.filter(r => r.status === 'fulfilled').length, 5);
eq('دقیقاً ۱ ردیف صورتجلسه (بدون duplicate)', Number(minutesCount), 1);

// ── امضای بقیهٔ سالن‌ها (مستقیم — گلوگاه قبلاً اثبات شده) ──
for (const hid of hallIds.slice(1)) {
  const sup = proctors.find((p: any) => Number(p.hallId) === Number(hid));
  await engine.signHallMinutes(null, { sessionId: Number(sess.id), hallId: Number(hid), supervisorStaffId: Number(sup.staffId) });
}

// ═══ ۴) تحویل هم‌زمان به مخزن ×۵ (سالن ۱) ═══
console.log('\n④ تحویل هم‌زمان به مخزن (۵ موازی):');
// برگهٔ واقعیِ درسِ اول در سالن ۱ (همان فرمول موتور) — مبنا برای «فقط یک‌بار» بودن
const expectedSheets = Number((await db.execute(sql`
  SELECT count(*) FILTER (WHERE a."isPresent" = 1) AS n
  FROM seat_allocations sa
  JOIN enrollments e ON e.id = sa."enrollmentId"
  LEFT JOIN exam_attendances a ON a."examId" = sa."sessionId" AND a."studentId" = e."studentId"
  WHERE sa."sessionId" = ${sess.id} AND sa."hallId" = ${hallIds[0]} AND e."offeringId" = ${offerings[0].id}
`)).rows[0].n);
const before = (await db.execute(sql`
  SELECT "totalDeliveredSheets", "receivedHallsCount" FROM course_exam_sessions WHERE "courseOfferingId"=${offerings[0].id}
`)).rows[0];
const vaultResults = await Promise.allSettled(Array.from({ length: 5 }, () =>
  engine.vaultReceiveHall(null, { sessionId: Number(sess.id), hallId: Number(hallIds[0]), vaultManagerId: Number(proctors[0].staffId) }),
));
const after = (await db.execute(sql`
  SELECT "totalDeliveredSheets", "receivedHallsCount" FROM course_exam_sessions WHERE "courseOfferingId"=${offerings[0].id}
`)).rows[0];
eq('۵ فراخوانی همگی OK (موفق یا idempotent)', vaultResults.filter(r => r.status === 'fulfilled').length, 5);
eq('برگه دقیقاً ۱ بار شمرده شد (double-count=0)',
  Number(after.totalDeliveredSheets) - Number(before.totalDeliveredSheets), expectedSheets);
eq('receivedHallsCount فقط ۱ واحد (نه ۵)', Number(after.receivedHallsCount) - Number(before.receivedHallsCount), 1);

// ── تحویل بقیهٔ سالن‌ها + نهایی‌سازی ──
for (const hid of hallIds.slice(1)) {
  await engine.vaultReceiveHall(null, { sessionId: Number(sess.id), hallId: Number(hid), vaultManagerId: Number(proctors[0].staffId) });
}
await engine.finalizeVaultHandover(null, Number(sess.id), Number(proctors[0].staffId));
const finalCounts = (await db.execute(sql`
  SELECT "receivedHallsCount" FROM course_exam_sessions WHERE "courseOfferingId"=${offerings[0].id}
`)).rows[0];
eq('پس از ۱۰ سالن: دقیقاً ۱۰ (یک‌بار به‌ازای هر سالن)', Number(finalCounts.receivedHallsCount), hallIds.length);

// ═══ ۵) تحویل هم‌زمان به استاد ×۵ (رأس درس اول) ═══
console.log('\n⑤ تحویل هم‌زمان به استاد (۵ موازی):');
const prof = offerings[0].professorId;
const delResults = await Promise.allSettled(Array.from({ length: 5 }, () =>
  engine.deliverToInstructor(null, { offeringId: Number(offerings[0].id), instructorId: Number(prof), vaultManagerId: Number(proctors[0].staffId) }),
));
const deliveredCount = delResults.filter(r => r.status === 'fulfilled' && (r.value as any).ok === true).length;
eq('فقط ۱ تحویل فعال ثبت می‌شود', deliveredCount, 1);
const activeDeliveries = (await db.execute(sql`
  SELECT count(*) n FROM instructor_deliveries WHERE "courseOfferingId"=${offerings[0].id} AND status <> 'ARCHIVED'
`)).rows[0].n;
eq('۱ ردیف تحویل فعال در DB', Number(activeDeliveries), 1);

// ═══ ۶) ثبت هم‌زمان نمرات ×۵ (همان درس) ═══
console.log('\n⑥ ثبت هم‌زمان نمرات (۵ موازی):');
const entry = { studentId: Number(rosterByHall.get(Number(hallIds[0]))[0].studentId), midtermScore: 6, finalExamScore: 10 };
const gradeResults = await Promise.allSettled(Array.from({ length: 5 }, () =>
  engine.submitExamGrades(null, { offeringId: Number(offerings[0].id), instructorId: Number(prof), rubric: RUBRIC, entries: [entry] }),
));
const okGrades = gradeResults.filter(r => r.status === 'fulfilled' && (r.value as any).ok === true).length;
const rejected = gradeResults.filter(r => (r.status === 'rejected') || (r.status === 'fulfilled' && !(r.value as any)?.ok)).length;
eq('فقط ۱ ثبت نمره موفق (بقیه رد گلوگاه state)', okGrades, 1);
eq('بقیه با خطای وضعیت رد شدند', rejected, 4);
const deliveryStatus = (await db.execute(sql`
  SELECT status FROM instructor_deliveries WHERE "courseOfferingId"=${offerings[0].id}
`)).rows[0].status;
eq('وضعیت تحویل → GRADES_SUBMITTED', deliveryStatus, 'GRADES_SUBMITTED');

// ═══ ۷) باز کردن همزمان اعتراض ×۵ (همان ثبت‌نام) ═══
console.log('\n⑦ باز کردن هم‌زمان اعتراض (۵ موازی):');
const [enrRow] = (await db.execute(sql`
  SELECT id FROM enrollments WHERE "offeringId"=${offerings[0].id} AND "studentId"=${entry.studentId}
`)).rows;
const appealResults = await Promise.allSettled(Array.from({ length: 5 }, () =>
  engine.openExamAppeal(null, { enrollmentId: Number(enrRow.id), studentMessage: 'بازبینی همزمان' }),
));
const opened = appealResults.filter(r => r.status === 'fulfilled' && (r.value as any).ok === true).length;
eq('فقط ۱ اعتراض باز ثبت شد', opened, 1);
const openAppeals = (await db.execute(sql`
  SELECT count(*) n FROM grade_appeals WHERE "enrollmentId"=${enrRow.id} AND status='OPEN'
`)).rows[0].n;
eq('۱ ردیف باز در DB', Number(openAppeals), 1);

console.log(`\nنتایج همزمانی: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
