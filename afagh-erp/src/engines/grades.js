'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  ماژول ۵ — ثبت نمرات، OTP دو مرحله‌ای، اعتراضات و بستن ترم (سند §۱۱۸۸–۱۳۵۰ و §۲۱۹۵–۲۲۶۰)
 *
 *  چرخه حیات نمره (Grade State Machine):
 *    PENDING → DRAFT (پیش‌نویس استاد؛ دانشجو نمی‌بیند)
 *            → TEMPORARY (ثبت موقت؛ دانشجو با «گیت ارزشیابی» می‌بیند + دکمه اعتراض)
 *            → APPEALED (اعتراض باز؛ قفل تا پاسخ استاد)
 *            → FINALIZED (قطعی؛ فقط با شورای آموزشی تغییر می‌کند)
 *
 *  امنیت نهایی‌سازی: کد ۵ رقمی OTP با اعتبار ۲ دقیقه، حداکثر ۳ تلاش؛
 *  تلاش سوم ناموفق = قفل + هشدار امنیتی به حراست/آموزش.
 *  امضای دیجیتال: هش SHA-256 کل لیست نمرات در DB فریز می‌شود (کشف دستکاری).
 * ══════════════════════════════════════════════════════════════════════
 */
const crypto = require('crypto');
const { db, tx } = require('../db');
const rbac = require('./rbac');

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const OTP_TTL_MIN = 2;
const OTP_MAX_ATTEMPTS = 3;

function notify(userId, eventCode, vars = {}, explicitText = null) {
  if (!userId) return;
  const tpl = db.prepare(`SELECT * FROM notification_templates WHERE eventCode = ? AND isActive = 1`).get(eventCode);
  let text = explicitText || `[${eventCode}]`;
  if (tpl) text = tpl.templateText.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `«${k}»`);
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`).run(userId, eventCode, JSON.stringify({ text, vars }));
}

const offeringFull = offeringId => db.prepare(`
  SELECT o.*, c.code, c.title, c.units, c.gradingType, t.title AS termTitle, t.gradeEntryDeadline,
         t.appealWindowDays, t.professorAppealSlaDays,
         (SELECT u.id FROM users u JOIN staff s ON s.userId = u.id WHERE s.id = o.professorId) AS profUserId
  FROM course_offerings o
  JOIN courses c ON c.id = o.courseId
  JOIN academic_terms t ON t.id = o.termId
  WHERE o.id = ?`).get(offeringId);

const profUserIds = offeringId => db.prepare(`
  SELECT DISTINCT u.id FROM offering_professors op
  JOIN staff s ON s.id = op.staffId JOIN users u ON u.id = s.userId WHERE op.offeringId = ?
  UNION SELECT u.id FROM course_offerings o JOIN staff s ON s.id = o.professorId
  JOIN users u ON u.id = s.userId WHERE o.id = ?`).all(offeringId, offeringId).map(r => r.id);

function ownsOffering(staffId, offeringId) {
  const o = db.prepare(`SELECT professorId FROM course_offerings WHERE id = ?`).get(offeringId);
  if (o && o.professorId === staffId) return true;
  return !!db.prepare(`SELECT 1 FROM offering_professors WHERE offeringId = ? AND staffId = ?`).get(offeringId, staffId);
}

/* ═══════════ پنل استاد ═══════════ */

function getProfessorOfferings(staffId) {
  return db.prepare(`
    SELECT o.id, c.code, c.title, c.units, o.groupNumber, o.enrolledCount, o.gradesTemporaryAt, o.gradesFinalizedAt,
           o.offeringType, o.customGradeDeadline,
           t.title AS termTitle, t.gradeEntryDeadline,
           SUM(CASE WHEN e.gradeStatus = 'FINALIZED' THEN 1 ELSE 0 END) AS finalizedCount,
           SUM(CASE WHEN e.gradeStatus IN ('PENDING','DRAFT') THEN 1 ELSE 0 END) pendingCount,
           SUM(CASE WHEN e.gradeStatus IN ('TEMPORARY','APPEALED') THEN 1 ELSE 0 END) temporaryCount
    FROM course_offerings o
    JOIN courses c ON c.id = o.courseId
    JOIN academic_terms t ON t.id = o.termId
    LEFT JOIN enrollments e ON e.offeringId = o.id AND e.status = 'REGISTERED'
    WHERE o.termId = (SELECT id FROM academic_terms WHERE isCurrent = 1)
      AND (o.professorId = ? OR EXISTS (SELECT 1 FROM offering_professors op WHERE op.offeringId = o.id AND op.staffId = ?))
    GROUP BY o.id ORDER BY c.code`).all(staffId, staffId).map(r => ({ ...r, openAppeals: openAppealCount(r.id) }));
}

const openAppealCount = offeringId => db.prepare(`
  SELECT COUNT(*) AS c FROM grade_appeals ga JOIN enrollments e ON e.id = ga.enrollmentId
  WHERE e.offeringId = ? AND ga.status = 'OPEN'`).get(offeringId).c;

function getRoster(staffId, offeringId) {
  if (!ownsOffering(staffId, offeringId)) throw new Error('این کلاس به شما تعلق ندارد.');
  const off = offeringFull(offeringId);
  const students = db.prepare(`
    SELECT e.id AS enrollmentId, s.studentCode, u.firstName, u.lastName, e.gradeValue, e.gradeStatus,
           e.hasEvaluated, c.gradingType
    FROM enrollments e
    JOIN students s ON s.id = e.studentId JOIN users u ON u.id = s.userId
    JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId
    WHERE e.offeringId = ? AND e.status = 'REGISTERED'
    ORDER BY s.studentCode`).all(offeringId);
  return { offering: off, students };
}

/** ورود/ذخیره پیش‌نویس نمرات (DRAFT) */
function saveDraft(staffId, offeringId, grades) {
  return tx(() => {
    if (!ownsOffering(staffId, offeringId)) throw new Error('دسترسی ندارید.');
    const off = offeringFull(offeringId);
    if (off.gradesFinalizedAt) throw new Error('نمرات این کلاس قطعی شده و غیرقابل ویرایش است (فقط شورای آموزشی).');
    let saved = 0;
    const upd = db.prepare(`UPDATE enrollments SET gradeValue = ?, gradeStatus = 'DRAFT' WHERE id = ? AND gradeStatus IN ('PENDING','DRAFT','TEMPORARY')`);
    for (const g of grades) {
      const v = Number(g.gradeValue);
      if (!Number.isFinite(v) || v < 0 || v > 20) throw new Error(`نمره نامعتبر (${g.gradeValue}) — بازه ۰ تا ۲۰.`);
      if (upd.run(v, g.enrollmentId).changes) saved++;
    }
    return { saved, remaining: db.prepare(`SELECT COUNT(*) AS c FROM enrollments WHERE offeringId = ? AND status='REGISTERED' AND gradeStatus = 'PENDING'`).get(offeringId).c };
  });
}

/** ثبت موقت — نمره برای دانشجو (پس از ارزشیابی) ظاهر و دکمه اعتراض فعال می‌شود */
function submitTemporary(staffId, offeringId) {
  return tx(() => {
    if (!ownsOffering(staffId, offeringId)) throw new Error('دسترسی ندارید.');
    const off = offeringFull(offeringId);
    if (off.gradesFinalizedAt) throw new Error('نمرات قطعی است.');
    if (openAppealCount(offeringId)) throw new Error('اعتراض بازی وجود دارد؛ ابتدا رسیدگی کنید.');
    const missing = db.prepare(`SELECT COUNT(*) AS c FROM enrollments WHERE offeringId = ? AND status='REGISTERED' AND (gradeValue IS NULL OR gradeStatus = 'PENDING')`).get(offeringId).c;
    if (missing) throw new Error(`${missing} دانشجو بدون نمره مانده — نمره همه را وارد کنید.`);
    db.prepare(`UPDATE enrollments SET gradeStatus = 'TEMPORARY' WHERE offeringId = ? AND status = 'REGISTERED' AND gradeStatus IN ('DRAFT','TEMPORARY')`).run(offeringId);
    db.prepare(`UPDATE course_offerings SET gradesTemporaryAt = CURRENT_TIMESTAMP WHERE id = ?`).run(offeringId);
    for (const uid of profUserIds(offeringId)) void uid;
    const stu = db.prepare(`
      SELECT u.id FROM enrollments e JOIN students s ON s.id = e.studentId JOIN users u ON u.id = s.userId
      WHERE e.offeringId = ? AND e.status = 'REGISTERED'`).all(offeringId);
    for (const s of stu) notify(s.id, 'GRADES_TEMPORARY', { course: off.title });
    rbac.audit({ actorUserId: off.profUserId, action: 'GRADES_TEMPORARY', entityType: 'offering', entityId: offeringId });
    return { ok: true, appealWindowDays: off.appealWindowDays };
  });
}

/** درخواست کد تایید ۵ رقمی (شبیه‌سازی ارسال پیامک از طریق اعلان) */
function requestFinalizeOtp(staffId, offeringId, actorUserId) {
  return tx(() => {
    if (!ownsOffering(staffId, offeringId)) throw new Error('دسترسی ندارید.');
    const off = offeringFull(offeringId);
    if (off.gradesFinalizedAt) throw new Error('نمرات این کلاس قبلاً قطعی شده است.');
    const anyTemporary = db.prepare(`SELECT COUNT(*) AS c FROM enrollments WHERE offeringId = ? AND gradeStatus IN ('TEMPORARY','APPEALED')`).get(offeringId).c;
    if (!anyTemporary) throw new Error('ابتدا نمرات را «ثبت موقت» کنید.');
    if (openAppealCount(offeringId)) throw new Error('اعتراض بازی وجود دارد؛ پس از رسیدگی نهایی کنید.');
    const lock = db.prepare(`SELECT lockedAt FROM grade_submission_otps WHERE staffId = ? AND offeringId = ? AND lockedAt IS NOT NULL AND lockedAt > datetime('now','-10 minutes')`).get(staffId, offeringId);
    if (lock) throw new Error('به دلیل تلاش‌های ناموفق، فرآیند نهایی‌سازی موقتاً قفل است (۱۰ دقیقه).');
    const code = String(crypto.randomInt(10000, 99999));
    db.prepare(`INSERT INTO grade_submission_otps (staffId, offeringId, otpHash, expiresAt) VALUES (?,?,?, datetime('now','+${OTP_TTL_MIN} minutes'))`)
      .run(staffId, offeringId, sha(code));
    // شبیه‌سازی پیامک: کد در اعلان استاد درج می‌شود (در پروداکشن → سرویس پیامک)
    const u = db.prepare(`SELECT u.id, u.firstName FROM staff s JOIN users u ON u.id = s.userId WHERE s.id = ?`).get(staffId);
    notify(u.id, 'GRADE_OTP_SENT', { course: off.title, code }, `استاد گرامی، کد تایید نهایی‌سازی نمرات درس «${off.title}»: ${code} — این کد تا ۲ دقیقه دیگر معتبر است.`);
    return { ok: true, expiresInMinutes: OTP_TTL_MIN, sentTo: `09•••${String(u.id).padStart(5, '0')}` };
  });
}

/** نهایی‌سازی با کد — قفل کامل + امضای دیجیتال + ارزیابی پایان ترم خودکار */
function finalizeWithOtp(staffId, offeringId, code, actorUserId) {
  return tx(() => {
    if (!ownsOffering(staffId, offeringId)) throw new Error('دسترسی ندارید.');
    const off = offeringFull(offeringId);
    if (off.gradesFinalizedAt) throw new Error('قبلاً قطعی شده است.');
    const otp = db.prepare(`SELECT * FROM grade_submission_otps WHERE staffId = ? AND offeringId = ? ORDER BY id DESC LIMIT 1`).get(staffId, offeringId);
    if (!otp) throw new Error('ابتدا درخواست کد تایید بدهید.');
    if (otp.lockedAt && otp.lockedAt > new Date(Date.now() - 10 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)) throw new Error('فرآیند قفل است؛ کمی بعد تلاش کنید.');
    if (otp.isUsed) throw new Error('این کد قبلاً استفاده شده؛ کد جدید بگیرید.');
    if (otp.expiresAt < new Date().toISOString().replace('T', ' ').slice(0, 19)) throw new Error('کد منقضی شده؛ کد جدید بگیرید.');
    if (sha(String(code).trim()) !== otp.otpHash) {
      const attempts = otp.attempts + 1;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        db.prepare(`UPDATE grade_submission_otps SET attempts = ?, lockedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(attempts, otp.id);
        // هشدار امنیتی به حراست/مدیریت آموزش (سند §۲۲۳۵)
        for (const a of db.prepare(`SELECT u.id FROM user_roles ur JOIN roles r ON r.id = ur.roleId JOIN users u ON u.id = ur.userId WHERE r.code IN ('ADMIN','DEP_HEAD')`).all())
          notify(a.id, 'GRADE_OTP_SECURITY_ALERT', { course: off.title, attempts });
        rbac.audit({ actorUserId, action: 'GRADE_OTP_LOCKED', entityType: 'offering', entityId: offeringId, details: { attempts } });
        throw new Error('۳ تلاش ناموفق! فرآیند قفل و هشدار امنیتی به مدیریت ارسال شد.');
      }
      db.prepare(`UPDATE grade_submission_otps SET attempts = ? WHERE id = ?`).run(attempts, otp.id);
      throw new Error(`کد نادرست است (${attempts} از ${OTP_MAX_ATTEMPTS}).`);
    }
    db.prepare(`UPDATE grade_submission_otps SET isUsed = 1 WHERE id = ?`).run(otp.id);

    // قفل نهایی نمرات + امضای رمزنگاری‌شده لیست (سند §۲۰۵۹)
    const rows = db.prepare(`SELECT e.studentId, e.gradeValue FROM enrollments e WHERE e.offeringId = ? AND e.status = 'REGISTERED' ORDER BY e.studentId`).all(offeringId);
    const list = rows.map(r => `${r.studentId}:${Number(r.gradeValue).toFixed(2)}`).join('|');
    const gradesHash = sha(`OFFERING:${offeringId}|${list}`);
    db.prepare(`UPDATE enrollments SET gradeStatus = 'FINALIZED' WHERE offeringId = ? AND gradeStatus = 'TEMPORARY'`).run(offeringId);
    db.prepare(`UPDATE course_offerings SET gradesHash = ?, gradesFinalizedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(gradesHash, offeringId);

    const stu = db.prepare(`
      SELECT u.id, e.studentId FROM enrollments e JOIN students s ON s.id = e.studentId JOIN users u ON u.id = s.userId
      WHERE e.offeringId = ? AND e.status = 'REGISTERED'`).all(offeringId);
    const closed = [];
    for (const s of stu) {
      notify(s.id, 'GRADES_FINALIZED', { course: off.title });
      const r = checkAndCloseStudentTerm(s.studentId, off.termId);
      if (r.closed) closed.push({ studentId: s.studentId, event: r.event, gpa: r.gpa });
    }
    rbac.audit({ actorUserId, action: 'GRADES_FINALIZED', entityType: 'offering', entityId: offeringId, details: { gradesHash, students: rows.length } });
    return { ok: true, gradesHash: gradesHash.slice(0, 16) + '…', students: rows.length, termClosedFor: closed };
  });
}

/* ═══════════ بستن ترم دانشجو (اتصال به موتور آیین‌نامه‌ها) ═══════════ */

function checkAndCloseStudentTerm(studentId, termId) {
  const remaining = db.prepare(`
    SELECT COUNT(*) AS c FROM enrollments e JOIN course_offerings o ON o.id = e.offeringId
    WHERE e.studentId = ? AND o.termId = ? AND e.status = 'REGISTERED' AND e.gradeStatus NOT IN ('FINALIZED')`).get(studentId, termId).c;
  if (remaining > 0) return { closed: false };
  const gpaEngine = require('./gpa');
  const regs = require('./regulations');
  const userId = db.prepare(`SELECT userId FROM students WHERE id = ?`).get(studentId)?.userId;
  const term = db.prepare(`SELECT title FROM academic_terms WHERE id = ?`).get(termId);
  const gpa = gpaEngine.computeTranscript(studentId);
  // اسنپ‌شات فریز‌شده کارنامه (مصون از تغییر آیین‌نامه‌های آینده)
  const snap = JSON.stringify({ term: term.title, overallGpa: gpa.overallGpa, passedUnits: gpa.totalPassedUnits, terms: gpa.terms });
  db.prepare(`INSERT OR IGNORE INTO transcript_snapshots (studentId, termId, snapshotJson, snapshotHash) VALUES (?,?,?,?)`)
    .run(studentId, termId, snap, sha(snap));
  // رویدادهای پایان ترم (مشروطی/اتمام سنوات) — موتور آیین‌نامه‌ها
  const eot = regs.evaluateEndOfTerm(studentId);
  if (eot.event) {
    db.prepare(`UPDATE students SET status = 'BLOCKED_COMMISSION' WHERE id = ?`).run(studentId);
    notify(userId, eot.event, { term: term.title });
    for (const a of db.prepare(`SELECT u.id FROM user_roles ur JOIN roles r ON r.id = ur.roleId JOIN users u ON u.id = ur.userId WHERE r.code = 'DEP_HEAD'`).all())
      notify(a.id, 'STUDENT_BLOCKED', { studentId, event: eot.event });
  } else {
    notify(userId, 'TERM_CLOSED', { term: term.title, gpa: gpa.overallGpa ?? '—' });
  }
  return { closed: true, event: eot.event, gpa: gpa.overallGpa };
}

/* ═══════════ اعتراض دانشجو + SLA استاد ═══════════ */

function appealGrade(studentId, enrollmentId, message) {
  return tx(() => {
    const e = db.prepare(`
      SELECT e.*, o.gradesTemporaryAt, t.appealWindowDays, c.title, o.id AS offId
      FROM enrollments e JOIN course_offerings o ON o.id = e.offeringId
      JOIN courses c ON c.id = o.courseId JOIN academic_terms t ON t.id = o.termId
      WHERE e.id = ? AND e.studentId = ?`).get(enrollmentId, studentId);
    if (!e) throw new Error('ثبت‌نام یافت نشد.');
    if (e.gradeStatus !== 'TEMPORARY') throw new Error('فقط نمره «موقت» قابل اعتراض است.');
    if (!message || message.trim().length < 5) throw new Error('متن اعتراض کوتاه است.');
    const windowDays = Number(e.appealWindowDays || 3);
    const deadline = new Date(new Date(e.gradesTemporaryAt || 0).getTime() + windowDays * 86400000);
    if (Date.now() > deadline) throw new Error(`بازه قانونی اعتراض (${windowDays} روز) گذشته است.`);
    if (db.prepare(`SELECT 1 FROM grade_appeals WHERE enrollmentId = ? AND status = 'OPEN'`).get(enrollmentId)) throw new Error('اعتراض قبلی شما در حال بررسی است.');
    db.prepare(`INSERT INTO grade_appeals (enrollmentId, studentMessage, oldGrade) VALUES (?,?,?)`).run(enrollmentId, message.trim(), e.gradeValue);
    db.prepare(`UPDATE enrollments SET gradeStatus = 'APPEALED' WHERE id = ?`).run(enrollmentId);
    for (const uid of profUserIds(e.offId)) notify(uid, 'GRADE_APPEALED', { course: e.title });
    return { ok: true };
  });
}

function getProfessorAppeals(staffId) {
  return db.prepare(`
    SELECT ga.id, ga.studentMessage, ga.professorReply, ga.oldGrade, ga.newGrade, ga.status, ga.createdAt,
           ga.enrollmentId, c.title AS courseTitle, s.studentCode, u.firstName, u.lastName,
           e.gradeValue, e.gradeStatus, o.id AS offeringId, t.professorAppealSlaDays,
           CAST((julianday('now') - julianday(ga.createdAt)) * 24 AS INTEGER) AS hoursOpen
    FROM grade_appeals ga
    JOIN enrollments e ON e.id = ga.enrollmentId
    JOIN course_offerings o ON o.id = e.offeringId
    JOIN courses c ON c.id = o.courseId
    JOIN students s ON s.id = e.studentId JOIN users u ON u.id = s.userId
    JOIN academic_terms t ON t.id = o.termId
    WHERE ga.status = 'OPEN' AND (o.professorId = ? OR EXISTS (SELECT 1 FROM offering_professors op WHERE op.offeringId = o.id AND op.staffId = ?))
    ORDER BY ga.createdAt`).all(staffId, staffId);
}

function respondAppeal(staffId, appealId, decision, reply, newGrade, actorUserId) {
  return tx(() => {
    const ga = db.prepare(`SELECT ga.*, e.offeringId, e.studentId FROM grade_appeals ga JOIN enrollments e ON e.id = ga.enrollmentId WHERE ga.id = ?`).get(appealId);
    if (!ga || ga.status !== 'OPEN') throw new Error('اعتراض یافت نشد یا بسته شده است.');
    if (!ownsOffering(staffId, ga.offeringId)) throw new Error('این اعتراض به کلاس شما تعلق ندارد.');
    if (!reply || reply.trim().length < 3) throw new Error('پاسخ استاد الزامی است.');
    if (decision === 'ACCEPTED') {
      const v = Number(newGrade);
      if (!Number.isFinite(v) || v < 0 || v > 20) throw new Error('نمره جدید نامعتبر است (۰ تا ۲۰).');
      db.prepare(`UPDATE enrollments SET gradeValue = ?, gradeStatus = 'TEMPORARY' WHERE id = ?`).run(v, ga.enrollmentId);
      db.prepare(`UPDATE grade_appeals SET status='ACCEPTED', professorReply=?, newGrade=? WHERE id=?`).run(reply.trim(), v, appealId);
    } else {
      db.prepare(`UPDATE enrollments SET gradeStatus = 'TEMPORARY' WHERE id = ?`).run(ga.enrollmentId);
      db.prepare(`UPDATE grade_appeals SET status='REJECTED', professorReply=? WHERE id=?`).run(reply.trim(), appealId);
    }
    const uid = db.prepare(`SELECT userId FROM students WHERE id = ?`).get(ga.studentId)?.userId;
    notify(uid, decision === 'ACCEPTED' ? 'APPEAL_ACCEPTED' : 'APPEAL_REJECTED', { reply: reply.trim() });
    rbac.audit({ actorUserId, action: `APPEAL_${decision}`, entityType: 'appeal', entityId: appealId, details: { newGrade } });
    return { ok: true };
  });
}

/* ═══════════ موتور SLA نمرات (تایم‌اوت اتوماتیک + ددلاین) ═══════════ */

function runGradeSlaSweeper() {
  const actions = [];
  // ۱) اعتراضات بی‌پاسخ بیش از مهلت استاد → قطعی خودکار + گزارش به مدیر گروه
  const stale = db.prepare(`
    SELECT ga.id, ga.enrollmentId, t.professorAppealSlaDays,
           (julianday('now') - julianday(ga.createdAt)) AS days
    FROM grade_appeals ga
    JOIN enrollments e ON e.id = ga.enrollmentId
    JOIN course_offerings o ON o.id = e.offeringId
    JOIN academic_terms t ON t.id = o.termId
    WHERE ga.status = 'OPEN' AND julianday('now') > julianday(ga.createdAt) + t.professorAppealSlaDays`).all();
  for (const r of stale) {
    tx(() => {
      db.prepare(`UPDATE grade_appeals SET status='REJECTED', professorReply='عدم پاسخ استاد در مهلت قانونی — قطعی خودکار توسط سامانه' WHERE id = ?`).run(r.id);
      db.prepare(`UPDATE enrollments SET gradeStatus = 'FINALIZED' WHERE id = ?`).run(r.enrollmentId);
      const sid = db.prepare(`SELECT studentId, offeringId FROM enrollments WHERE id = ?`).get(r.enrollmentId);
      const termId = db.prepare(`SELECT termId FROM course_offerings WHERE id = ?`).get(sid.offeringId).termId;
      checkAndCloseStudentTerm(sid.studentId, termId);
      for (const uid of profUserIds(sid.offeringId)) notify(uid, 'APPEAL_AUTO_CLOSED', {});
      for (const a of db.prepare(`SELECT u.id FROM user_roles ur JOIN roles r ON r.id = ur.roleId JOIN users u ON u.id = ur.userId WHERE r.code = 'DEP_HEAD'`).all())
        notify(a.id, 'PROFESSOR_LATE_REPORT', {});
      actions.push({ appealId: r.id, applied: 'AUTO_CLOSE' });
    });
  }
  // ۲) هشدار ددلاین ثبت نمره (۷۲ و ۲۴ ساعت مانده + گذشت مهلت → ارجاع به مدیر گروه)
  const offs = db.prepare(`
    SELECT o.id, c.title, t.gradeEntryDeadline FROM course_offerings o
    JOIN courses c ON c.id = o.courseId JOIN academic_terms t ON t.id = o.termId
    WHERE t.isCurrent = 1 AND o.gradesFinalizedAt IS NULL AND t.gradeEntryDeadline IS NOT NULL`).all();
  for (const o of offs) {
    const hoursLeft = Math.floor((new Date(o.gradeEntryDeadline + 'Z').getTime() - Date.now()) / 3600000);
    if (![72, 24, 0].includes(hoursLeft)) continue;
    const event = hoursLeft === 0 ? 'GRADE_DEADLINE_PASSED' : hoursLeft === 24 ? 'GRADE_DEADLINE_24H' : 'GRADE_DEADLINE_72H';
    const already = db.prepare(`SELECT 1 FROM notifications WHERE eventCode = ? AND payload LIKE ? AND createdAt > datetime('now','-20 hours')`)
      .get(event, `%"course":"${o.title}"%`);
    if (already) continue;
    for (const uid of profUserIds(o.id)) notify(uid, event, { course: o.title });
    if (hoursLeft === 0)
      for (const a of db.prepare(`SELECT u.id FROM user_roles ur JOIN roles r ON r.id = ur.roleId JOIN users u ON u.id = ur.userId WHERE r.code = 'DEP_HEAD'`).all())
        notify(a.id, 'GRADE_DEADLINE_PASSED', { course: o.title });
    actions.push({ offeringId: o.id, applied: event });
  }
  return actions;
}

/* ═══════════ گیت ارزشیابی (گمنامی مطلق) ═══════════ */

function getEvaluationForm(offeringId) {
  const period = db.prepare(`SELECT * FROM evaluation_periods WHERE isActive = 1 AND datetime('now') BETWEEN startDate AND endDate`).get();
  if (!period) return { open: false, questions: [] };
  // فرم پویا از form_assignments (سند §۱۳۲۵): عملی/نظری بر اساس نوع درس — خاص‌ترین قاعده برنده
  const course = db.prepare(`SELECT c.* FROM courses c JOIN course_offerings o ON o.courseId = c.id WHERE o.id = ?`).get(offeringId) || {};
  const form = db.prepare(`
    SELECT f.id, f.title FROM evaluation_forms f
    JOIN form_assignments fa ON fa.formId = f.id
    WHERE f.targetType = 'PROFESSOR'
      AND (fa.departmentId IS NULL OR fa.departmentId = ?)
      AND (fa.courseType IS NULL OR fa.courseType = ?)
      AND (fa.practicalOnly IS NULL OR (fa.practicalOnly = 1 AND ? > 0) OR (fa.practicalOnly = 0 AND ? = 0))
    ORDER BY ((fa.departmentId IS NOT NULL) + (fa.courseType IS NOT NULL) + (fa.practicalOnly IS NOT NULL)) DESC, f.id
    LIMIT 1`).get(course.departmentId ?? null, course.courseType ?? null, Number(course.practicalUnits || 0), Number(course.practicalUnits || 0))
    || db.prepare(`SELECT id, title FROM evaluation_forms WHERE targetType = 'PROFESSOR' ORDER BY id LIMIT 1`).get();
  if (!form) return { open: false, questions: [] };
  const questions = db.prepare(`SELECT id, questionText, questionType, weight, orderIndex FROM evaluation_questions WHERE formId = ? ORDER BY orderIndex`).all(form.id);
  for (const q of questions)
    q.options = db.prepare(`SELECT id, optionLabel, scoreValue FROM question_options WHERE questionId = ?`).all(q.id);
  return { open: true, period: { id: period.id, title: period.title, endDate: period.endDate }, form: form.title, questions };
}

/** ثبت ارزشیابی — هیچ ارجاعی به دانشجو ذخیره نمی‌شود؛ فقط فلگ hasEvaluated زده می‌شود */
function submitEvaluation(studentId, offeringId, answers) {
  return tx(() => {
    const e = db.prepare(`SELECT e.id, e.hasEvaluated FROM enrollments e WHERE e.studentId = ? AND e.offeringId = ? AND e.status = 'REGISTERED'`).get(studentId, offeringId);
    if (!e) throw new Error('ثبت‌نام یافت نشد.');
    if (e.hasEvaluated) throw new Error('قبلاً ارزشیابی کرده‌اید.');
    const form = getEvaluationForm(offeringId);
    if (!form.open) throw new Error('دوره ارزشیابی باز نیست.');
    const ins = db.prepare(`INSERT INTO evaluation_responses (periodId, offeringId, questionId, selectedOptionId, textAnswer) VALUES (?,?,?,?,?)`);
    for (const a of answers) {
      const q = form.questions.find(x => x.id === a.questionId);
      if (!q) continue;
      ins.run(form.period.id, offeringId, q.id, a.optionId ?? null, a.text?.trim() || null);
    }
    db.prepare(`UPDATE enrollments SET hasEvaluated = 1 WHERE id = ?`).run(e.id);
    return { ok: true };
  });
}

/** نمرات ترم جاری دانشجو — گیت ارزشیابی: بدون ارزشیابی، نمره دیده نمی‌شود */
function getMyGrades(studentId) {
  return db.prepare(`
    SELECT e.id AS enrollmentId, e.offeringId, c.code, c.title, c.units, c.gradingType,
           e.gradeStatus, e.hasEvaluated,
           CASE WHEN e.hasEvaluated = 1 THEN e.gradeValue ELSE NULL END AS gradeValue,
           o.gradesTemporaryAt, t.appealWindowDays,
           (SELECT ga.status FROM grade_appeals ga WHERE ga.enrollmentId = e.id ORDER BY ga.id DESC LIMIT 1) AS appealStatus,
           (SELECT ga.professorReply FROM grade_appeals ga WHERE ga.enrollmentId = e.id ORDER BY ga.id DESC LIMIT 1) AS appealReply
    FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId
    JOIN courses c ON c.id = o.courseId
    JOIN academic_terms t ON t.id = o.termId
    WHERE e.studentId = ? AND o.termId = (SELECT id FROM academic_terms WHERE isCurrent = 1) AND e.status = 'REGISTERED'
    ORDER BY c.code`).all(studentId).map(r => {
    const windowDays = Number(r.appealWindowDays || 3);
    const canAppeal = r.gradeStatus === 'TEMPORARY' && r.appealStatus !== 'OPEN' && r.gradesTemporaryAt &&
      Date.now() < new Date(r.gradesTemporaryAt + 'Z').getTime() + windowDays * 86400000;
    return { ...r, canAppeal };
  });
}

/** تطبیق امضای نمرات قطعی (کشف دستکاری مستقیم در DB) */
function verifyGradesIntegrity() {
  const offs = db.prepare(`
    SELECT o.id, c.title, o.gradesHash FROM course_offerings o JOIN courses c ON c.id = o.courseId
    WHERE o.gradesHash IS NOT NULL`).all();
  return offs.map(o => {
    const rows = db.prepare(`SELECT e.studentId, e.gradeValue FROM enrollments e WHERE e.offeringId = ? AND e.status = 'REGISTERED' ORDER BY e.studentId`).all(o.id);
    const list = rows.map(r => `${r.studentId}:${Number(r.gradeValue).toFixed(2)}`).join('|');
    const expected = sha(`OFFERING:${o.id}|${list}`);
    return { offeringId: o.id, course: o.title, ok: expected === o.gradesHash };
  });
}

module.exports = {
  getProfessorOfferings, getRoster, saveDraft, submitTemporary,
  requestFinalizeOtp, finalizeWithOtp, checkAndCloseStudentTerm,
  appealGrade, getProfessorAppeals, respondAppeal, runGradeSlaSweeper,
  getEvaluationForm, submitEvaluation, getMyGrades, verifyGradesIntegrity
};
