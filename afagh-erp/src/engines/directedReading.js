'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  ماژول Micro-Offering — «معرفی به استاد» سه‌کلیکی — سند §۲۷۴۵–۲۷۷۵
 *
 *  ۱) بررسی هوشمند شرایط (Regulation Engine):
 *     • دانشجو در آستانهٔ فارغ‌التحصیلی باشد (واحد باقیمانده ≤ ۸)
 *     • سقف معرفی به استاد: حداکثر ۲ درس / ۴ واحد
 *  ۲) جادوی پس‌زمینه (یک تراکنش دیتابیس):
 *     • کلاس ایزوله: offeringType='DIRECTED_READING'، ظرفیت ۱، بدون برنامه هفتگی
 *     • نقش EXAMINER (ممتحن) — ورودی فرمول‌ساز مالی ×۰.۳۳ دانشجو (ماژول ۹)
 *     • ثبت‌نام قطعی خودکار (REGISTERED + isDirectedReading) بدون صف سبد خرید
 *     • Silent Billing: هزینهٔ متغیر در بدهی دانشجو می‌نشیند
 *  ۳) ددلاین مستقل نمره (customGradeDeadline — خط‌شکن تاریخ‌های استاندارد ترم)
 *     + شمارشگر معکوس و یادآور پیامکی اختصاصی همین درس
 * ══════════════════════════════════════════════════════════════════════
 */
const { db, tx } = require('../db');
const rbac = require('./rbac');
const regulations = require('./regulations');

const MAX_DR_COURSES = 2;   // حداکثر ۲ درس (سند §۲۷۵۱)
const MAX_DR_UNITS = 4;     // حداکثر ۴ واحد
const DEFAULT_DEADLINE_DAYS = 20; // مثال سند: ۲۰ روز از تاریخ صدور

function notify(userId, eventCode, vars = {}, explicitText = null) {
  if (!userId) return;
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`)
    .run(userId, eventCode, JSON.stringify({ text: explicitText || `[${eventCode}]`, vars }));
}

const daysLeft = ddl => {
  const iso = String(ddl).length === 10 ? ddl + 'T23:59:59Z' : ddl + 'Z';
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
};

/* ─── ۱) بررسی هوشمند شرایط (سند §۲۷۵۱) ─── */
function checkEligibility(studentCode) {
  const stu = db.prepare(`
    SELECT s.*, u.firstName, u.lastName, u.id AS userId, dl.title AS levelTitle,
           sy.minTotalUnitsToGraduate
    FROM students s
    JOIN users u ON u.id = s.userId
    JOIN degree_level_configs dl ON dl.id = s.degreeLevelId
    LEFT JOIN syllabuses sy ON sy.majorId = s.majorId
      AND s.entryYear >= sy.entryYearStart AND (sy.entryYearEnd IS NULL OR s.entryYear <= sy.entryYearEnd)
    WHERE s.studentCode = ?`).get(String(studentCode).trim());
  if (!stu) throw new Error('دانشجویی با این کد یافت نشد.');
  if (stu.status === 'GRADUATED') throw new Error('این دانشجو فارغ‌التحصیل شده است.');
  if (stu.status === 'WITHDRAWN' || stu.status === 'EXPELLED') throw new Error('وضعیت دانشجو مجاز به ثبت درس نیست.');

  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
  const graduating = regulations.isGraduating(stu.id);
  const passedUnits = regulations.computePassedUnits(stu.id);
  const remaining = stu.minTotalUnitsToGraduate != null ? stu.minTotalUnitsToGraduate - passedUnits : null;

  // مصرف فعلی سقف معرفی به استاد (دروس ناتمام این ترم)
  const used = db.prepare(`
    SELECT c.id AS courseId, c.code, c.title, c.units, e.gradeStatus, o.customGradeDeadline
    FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId
    JOIN courses c ON c.id = o.courseId
    WHERE e.studentId = ? AND e.isDirectedReading = 1 AND e.status = 'REGISTERED' AND o.termId = ?`).all(stu.id, term.id);
  const usedUnits = used.reduce((a, r) => a + Number(r.units), 0);

  const reasons = [];
  if (!graduating) reasons.push('دانشجو در آستانهٔ فارغ‌التحصیلی نیست (واحد باقیمانده > ۸) — ثبت درس معرفی به استاد فقط برای ترم آخر مجاز است.');
  if (used.length >= MAX_DR_COURSES) reasons.push(`سقف تعداد دروس معرفی به استاد پر است (${used.length} از ${MAX_DR_COURSES}).`);
  if (remaining != null && remaining < 0) reasons.push('همهٔ واحدهای فارغ‌التحصیلی گذرانده شده است.');

  return {
    student: { id: stu.id, code: stu.studentCode, name: `${stu.firstName} ${stu.lastName}`, level: stu.levelTitle, userId: stu.userId },
    term: term.title, graduating, passedUnits, remainingUnits: remaining,
    drUsed: { courses: used.length, units: usedUnits, limitCourses: MAX_DR_COURSES, limitUnits: MAX_DR_UNITS, list: used },
    eligible: reasons.length === 0, reasons
  };
}

/* ─── ۲) جادوی پس‌زمینه: ساخت کلاس ایزوله + ثبت‌نام خودکار + مالی (سند §۲۷۶۰) ─── */
function createDirectedReading(b, actorUserId) {
  const studentCode = b.studentCode, courseId = Number(b.courseId), staffId = Number(b.staffId);
  const deadlineDays = Math.min(Math.max(Number(b.deadlineDays) || DEFAULT_DEADLINE_DAYS, 1), 120);

  // بررسی هوشمند شرایط — همان موتور، این‌بار به‌عنوان گیت سخت
  const elg = checkEligibility(studentCode);
  if (!elg.eligible) throw new Error(`شرایط فراهم نیست: ${elg.reasons.join(' | ')}`);

  const course = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(courseId);
  if (!course) throw new Error('درس یافت نشد.');
  if (elg.drUsed.list.some(x => x.courseId === courseId)) throw new Error('این درس قبلاً برای دانشجو ثبت شده است.');
  if (elg.drUsed.units + Number(course.units) > MAX_DR_UNITS)
    throw new Error(`سقف واحد معرفی به استاد exceeded: ${elg.drUsed.units} + ${course.units} > ${MAX_DR_UNITS} واحد.`);

  const prof = db.prepare(`
    SELECT s.id, s.userId, u.firstName, u.lastName FROM staff s JOIN users u ON u.id = s.userId
    WHERE s.id = ? AND s.staffType = 'هیئت علمی'`).get(staffId);
  if (!prof) throw new Error('استاد هیئت علمی یافت نشد.');

  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();

  return tx(() => {
    // ① کلاس ایزوله (Micro-Offering): ظرفیت ۱، بدون برنامهٔ هفتگی، ددلاین اختصاصی نمره
    const grp = (db.prepare(`SELECT IFNULL(MAX(groupNumber),0) AS g FROM course_offerings WHERE termId = ? AND courseId = ?`).get(term.id, courseId).g || 0) + 1;
    db.prepare(`INSERT INTO course_offerings (termId, courseId, professorId, groupNumber, capacity, waitlistCapacity, offeringType, customGradeDeadline)
                VALUES (?,?,?,?,1,0,'DIRECTED_READING', date('now', '+${deadlineDays} days'))`)
      .run(term.id, courseId, staffId, grp);
    const offeringId = db.prepare(`SELECT last_insert_rowid() AS id`).get().id;
    // ② نقش ممتحن (ورودی فرمول مالی ماژول ۹)
    db.prepare(`INSERT INTO offering_professors (offeringId, staffId, role, sharePercentage) VALUES (?,?, 'EXAMINER', '100.00')`).run(offeringId, staffId);
    // ③ ثبت‌نام قطعی خودکار — بدون صف سبد خرید
    db.prepare(`INSERT INTO enrollments (studentId, offeringId, status, isDirectedReading) VALUES (?,?,'REGISTERED',1)`).run(elg.student.id, offeringId);
    db.prepare(`UPDATE course_offerings SET enrolledCount = 1 WHERE id = ?`).run(offeringId);
    // ④ Silent Billing: هزینهٔ متغیر در بدهی دانشجو (بدون مسدودسازی)
    const fin = db.prepare(`SELECT perUnitTuition FROM term_financial_rules WHERE termId = ? AND degreeLevelId = ?`).get(term.id, db.prepare(`SELECT degreeLevelId FROM students WHERE id=?`).get(elg.student.id).degreeLevelId);
    let billed = 0;
    if (fin && fin.perUnitTuition > 0) {
      billed = fin.perUnitTuition * Number(course.units);
      db.prepare(`INSERT INTO student_ledger (studentId, termId, transactionType, amount, description, referenceId) VALUES (?,?, 'DEBIT', ?, ?, ?)`)
        .run(elg.student.id, term.id, billed, `هزینهٔ متغیر درس معرفی به استاد ${course.title}`, offeringId);
    }
    // ⑤ اطلاع‌رسانی: دانشجو + استاد (با ددلاین اختصاصی)
    const ddl = db.prepare(`SELECT customGradeDeadline FROM course_offerings WHERE id = ?`).get(offeringId).customGradeDeadline;
    notify(elg.student.userId, 'DR_CREATED', { course: course.title },
      `درس «${course.title}» به‌صورت معرفی به استاد برای شما ثبت شد. استاد ممتحن: ${prof.firstName} ${prof.lastName}؛ مهلت ثبت نمره: ${String(ddl).slice(0, 10)}.`);
    notify(prof.userId, 'DR_ASSIGNED', { course: course.title, deadline: String(ddl).slice(0, 10) },
      `استاد گرامی، درس «${course.title}» (معرفی به استاد — دانشجو: ${elg.student.name}) با نقش «ممتحن» به شما محول شد. مهلت ثبت نمره: ${String(ddl).slice(0, 10)} (مستقل از تقویم ترم).`);

    rbac.audit({ actorUserId, action: 'DR_CREATED', entityType: 'offering', entityId: offeringId,
      details: { student: elg.student.code, course: course.code, examiner: staffId, deadlineDays, billed } });
    return { offeringId, deadline: String(ddl).slice(0, 10), billed, days: deadlineDays };
  });
}

/* ─── فهرست برای پنل کارشناس آموزش ─── */
function listDirectedReadings() {
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
  const list = db.prepare(`
    SELECT o.id, o.customGradeDeadline, c.code, c.title, c.units,
           u.firstName || ' ' || u.lastName AS studentName, s.studentCode,
           p.firstName || ' ' || p.lastName AS examinerName,
           (SELECT e.gradeStatus FROM enrollments e WHERE e.offeringId = o.id LIMIT 1) AS gradeStatus
    FROM course_offerings o
    JOIN courses c ON c.id = o.courseId
    JOIN enrollments e ON e.offeringId = o.id AND e.isDirectedReading = 1
    JOIN students s ON s.id = e.studentId JOIN users u ON u.id = s.userId
    JOIN staff st ON st.id = o.professorId JOIN users p ON p.id = st.userId
    WHERE o.termId = ? AND o.offeringType = 'DIRECTED_READING'
    ORDER BY o.id DESC`).all(term.id)
    .map(r => ({ ...r, daysLeft: r.customGradeDeadline ? daysLeft(r.customGradeDeadline) : null }));
  const courses = db.prepare(`SELECT id, code, title, units FROM courses ORDER BY code`).all();
  const professors = db.prepare(`
    SELECT s.id, u.firstName || ' ' || u.lastName AS name, s.academicRank AS rank
    FROM staff s JOIN users u ON u.id = s.userId WHERE s.staffType = 'هیئت علمی' ORDER BY s.id`).all();
  return { term: term.title, list, courses, professors, limits: { courses: MAX_DR_COURSES, units: MAX_DR_UNITS } };
}

/* ─── ۳) یادآور ددلاین اختصاصی (فقط همین درس — سند §۲۷۷۰) ─── */
function runDrDeadlineSweeper() {
  const actions = [];
  const offs = db.prepare(`
    SELECT o.id, o.customGradeDeadline, c.title, o.gradesFinalizedAt
    FROM course_offerings o JOIN courses c ON c.id = o.courseId
    WHERE o.offeringType = 'DIRECTED_READING' AND o.gradesFinalizedAt IS NULL AND o.customGradeDeadline IS NOT NULL`).all();
  for (const o of offs) {
    const dl = daysLeft(o.customGradeDeadline);
    if (dl > 7) continue; // هشدار از یک هفته مانده
    const event = dl <= 0 ? 'DR_DEADLINE_PASSED' : 'DR_DEADLINE_SOON';
    const dedupe = db.prepare(`SELECT 1 FROM notifications WHERE eventCode = ? AND payload LIKE ? AND createdAt > datetime('now','-23 hours')`)
      .get(event, `%"course":"${o.title}"%`);
    if (dedupe) continue;
    const uids = db.prepare(`
      SELECT u.id FROM course_offerings o2 JOIN staff s ON s.id = o2.professorId JOIN users u ON u.id = s.userId WHERE o2.id = ?
      UNION SELECT u.id FROM offering_professors op JOIN staff s ON s.id = op.staffId JOIN users u ON u.id = s.userId WHERE op.offeringId = ?`).all(o.id, o.id);
    for (const uid of uids)
      notify(uid.id, event, { course: o.title, days: dl },
        dl <= 0
          ? `⛔ مهلت ثبت نمرهٔ درس معرفی به استاد «${o.title}» گذشته است (${String(o.customGradeDeadline).slice(0,10)}). پرونده به مدیر گروه ارجاع شد.`
          : `⏰ یادآوری: مهلت ثبت نمرهٔ درس معرفی به استاد «${o.title}» تا ${String(o.customGradeDeadline).slice(0,10)} است (${dl} روز مانده — مستقل از تقویم ترم).`);
    if (dl <= 0)
      for (const a of db.prepare(`SELECT u.id FROM user_roles ur JOIN roles r ON r.id = ur.roleId JOIN users u ON u.id = ur.userId WHERE r.code = 'DEP_HEAD'`).all())
        notify(a.id, 'DR_DEADLINE_PASSED', { course: o.title }, `مهلت نمرهٔ معرفی‌به‌استاد «${o.title}» گذشته و نمره ثبت نشده است.`);
    actions.push({ offeringId: o.id, applied: event });
  }
  return actions;
}

module.exports = { checkEligibility, createDirectedReading, listDirectedReadings, runDrDeadlineSweeper, MAX_DR_COURSES, MAX_DR_UNITS };
