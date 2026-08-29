'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  ماژول ۶ — مدیریت امتحانات، تخصیص صندلی و مراقبین (سند §۱۴۱۶–۱۵۴۰)
 *
 *  موتور سه‌فازی چیدمان (Anti-Cheating Seating Engine):
 *    فاز ۱ — گروه‌بندی ساختاریافته: کد استاد → کد درس → شماره گروه
 *            (بلوک‌های مرتب برای توزیع آسان برگه‌ها در روز امتحان)
 *    فاز ۲ — درهم‌سازی تصادفی: Fisher-Yates Shuffle داخل هر بلوک
 *            (دوستان هم‌فصل کنار هم نمی‌نشینند)
 *    فاز ۳ — استراتژی چیدمان فیزیکی (قابل انتخاب توسط مدیر):
 *            • SEQUENTIAL  (عادی): پر شدن به ترتیب ۱،۲،۳،…
 *            • EVEN_ODD    (زوج/فرد): بلوک اول روی صندلی‌های فرد، بلوک دوم زوج
 *            • ALTERNATING (یک‌درمیان): زیگزاگ کامل بین همه بلوک‌ها
 *
 *  غیبت سیستمی: ثبت غیبت → پیامک قالب‌بندی‌شده (notification_templates) →
 *  مهلت ۴۸ ساعته گواهی (فرآیند EXCUSED_ABSENCE) → موجه: حذف درس /
 *  غیرموجه: طبق آیین‌نامه (rules.unexcused_absence_policy) نمره صفر قطعی.
 * ══════════════════════════════════════════════════════════════════════
 */
const { db, tx } = require('../db');
const rbac = require('./rbac');

function notify(userId, eventCode, vars = {}) {
  if (!userId) return;
  const tpl = db.prepare(`SELECT * FROM notification_templates WHERE eventCode = ? AND isActive = 1`).get(eventCode);
  if (!tpl) return;
  const text = tpl.templateText.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `«${k}»`);
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`).run(userId, eventCode, JSON.stringify({ text, vars }));
}

const shuffle = arr => { // Fisher-Yates (فاز ۲)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/* ═══════════ فاز ۳: استراتژی‌های چیدمان ═══════════ */
function placeBlocks(blocks, strategy) {
  const flat = [];
  if (strategy === 'SEQUENTIAL') {
    for (const b of blocks) flat.push(...b.students);
    return flat;
  }
  if (strategy === 'EVEN_ODD') {
    // بلوک اول روی صندلی‌های فرد (۱،۳،۵،…) و بلوک دوم روی زوج؛ زوج‌های بعدی پشت سر هم
    for (let i = 0; i < blocks.length; i += 2) {
      const a = [...blocks[i].students];
      const b = i + 1 < blocks.length ? [...blocks[i + 1].students] : [];
      while (a.length || b.length) { if (a.length) flat.push(a.shift()); if (b.length) flat.push(b.shift()); }
    }
    return flat;
  }
  // ALTERNATING: گردش کاملی بین همه بلوک‌ها (زیگزاگ — حداکثر فاصله هم‌درسی‌ها)
  const qs = blocks.map(b => [...b.students]);
  let alive = qs.filter(q => q.length).length;
  while (alive) {
    for (const q of qs) {
      if (q.length) { flat.push(q.shift()); if (!q.length) alive--; }
    }
  }
  return flat;
}

/* ═══════════ تولید چیدمان کل ترم ═══════════ */
function generateSeating({ strategy = 'ALTERNATING' } = {}, actorUserId) {
  return tx(() => {
    const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
    if (!term) throw new Error('ترم جاری یافت نشد.');

    // بازتولید idempotent: پاک‌سازی چیدمان قبلی همین ترم
    const oldIds = db.prepare(`SELECT id FROM exam_sessions WHERE termId = ?`).all(term.id).map(r => r.id);
    if (oldIds.length) {
      db.prepare(`DELETE FROM seat_allocations WHERE sessionId IN (${oldIds.join(',')})`).run();
      db.prepare(`DELETE FROM invigilators WHERE sessionId IN (${oldIds.join(',')})`).run();
      db.prepare(`DELETE FROM exam_sessions WHERE id IN (${oldIds.join(',')})`).run();
    }

    // همه امتحان‌های ترم + دانشجویان ثبت‌نام‌شده (تجمیع امتحانات همزمان)
    const rows = db.prepare(`
      SELECT sch.examDate, sch.startTime, sch.endTime, o.id AS offeringId, o.groupNumber,
             c.code, c.title, st.staffCode, (pu.firstName || ' ' || pu.lastName) AS professor,
             e.id AS enrollmentId, e.studentId, s.studentCode,
             (u.firstName || ' ' || u.lastName) AS studentName, su.id AS studentUserId
      FROM schedules sch
      JOIN course_offerings o ON o.id = sch.offeringId
      JOIN courses c ON c.id = o.courseId
      LEFT JOIN staff st ON st.id = o.professorId
      LEFT JOIN users pu ON pu.id = st.userId
      JOIN enrollments e ON e.offeringId = o.id AND e.status = 'REGISTERED'
      JOIN students s ON s.id = e.studentId
      JOIN users u ON u.id = s.userId
      JOIN users su ON su.id = s.userId
      WHERE sch.scheduleType = 'EXAM' AND sch.examDate IS NOT NULL AND o.termId = ?
      ORDER BY sch.examDate, sch.startTime, st.staffCode, c.code, o.groupNumber, s.studentCode`).all(term.id);

    if (!rows.length) throw new Error('امتحان ثبت‌نام‌شده‌ای برای چیدمان وجود ندارد.');

    // گروه‌بندی بر اساس جلسه (تاریخ + ساعت شروع)
    const sessionsMap = new Map();
    for (const r of rows) {
      const k = `${r.examDate}|${r.startTime}`;
      if (!sessionsMap.has(k)) sessionsMap.set(k, { examDate: r.examDate, startTime: r.startTime, endTime: r.endTime, rows: [] });
      sessionsMap.get(k).rows.push(r);
    }

    const halls = db.prepare(`SELECT id, name, totalCapacity AS capacity, rowsCount, colsCount, buildingName FROM exam_halls ORDER BY totalCapacity DESC`).all();
    if (!halls.length) throw new Error('سالنی تعریف نشده است.');

    const insSeat = db.prepare(`INSERT INTO seat_allocations (enrollmentId, sessionId, hallId, seatNumber, blockKey) VALUES (?,?,?,?,?)`);
    const summary = [];
    const notified = new Set();

    for (const [, sess] of sessionsMap) {
      const sid = db.prepare(`INSERT INTO exam_sessions (termId, examDate, startTime, endTime) VALUES (?,?,?,?)`)
        .run(term.id, sess.examDate, sess.startTime, sess.endTime).lastInsertRowid;

      // ── فاز ۱: بلوک‌بندی استاد → درس → گروه
      const blockMap = new Map();
      for (const r of sess.rows) {
        const key = `${r.staffCode || '---'}|${r.code}|گ${r.groupNumber}`;
        if (!blockMap.has(key)) blockMap.set(key, { key, course: r.title, code: r.code, professor: r.professor || '—', students: [] });
        blockMap.get(key).students.push(r);
      }
      const blocks = [...blockMap.values()].sort((a, b) => a.key.localeCompare(b.key, 'fa'));

      // ── فاز ۲: شافل داخل هر بلوک
      for (const b of blocks) shuffle(b.students);

      // ── فاز ۳: چیدمان فیزیکی + پخش روی سالن‌ها
      const ordered = placeBlocks(blocks, strategy);
      let hallIdx = 0, seatNo = 0;
      const hallsUsed = new Set();
      for (const r of ordered) {
        if (seatNo >= halls[hallIdx].capacity) { hallIdx++; seatNo = 0; if (hallIdx >= halls.length) throw new Error(`ظرفیت سالن‌ها برای جلسه ${sess.examDate} ${sess.startTime} کافی نیست.`); }
        seatNo++;
        insSeat.run(r.enrollmentId, sid, halls[hallIdx].id, seatNo, r.key);
        hallsUsed.add(halls[hallIdx].name);
        if (!notified.has(r.studentUserId)) { notify(r.studentUserId, 'SEATING_READY', {}); notified.add(r.studentUserId); }
      }
      summary.push({ sessionId: sid, examDate: sess.examDate, startTime: sess.startTime, students: ordered.length, blocks: blocks.length, halls: [...hallsUsed] });
    }
    rbac.audit({ actorUserId, action: 'SEATING_GENERATED', entityType: 'term', entityId: term.id, details: { strategy, sessions: summary.length } });
    return { ok: true, strategy, sessions: summary };
  });
}

/* ═══════════ کارتابل اداره امتحانات ═══════════ */
function getSessions() {
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
  return db.prepare(`
    SELECT es.id, es.examDate, es.startTime, es.endTime,
           COUNT(sa.id) AS students,
           (SELECT GROUP_CONCAT(v, '، ') FROM (SELECT DISTINCT c.title || ' (گ' || o.groupNumber || ')' AS v
              FROM seat_allocations sa2 JOIN enrollments e ON e.id = sa2.enrollmentId
              JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId
              WHERE sa2.sessionId = es.id) t) AS courses,
           (SELECT GROUP_CONCAT(v, '، ') FROM (SELECT DISTINCT cl.name AS v
              FROM seat_allocations sa3 JOIN exam_halls cl ON cl.id = sa3.hallId WHERE sa3.sessionId = es.id) t2) AS halls,
           (SELECT COUNT(*) FROM invigilators iv WHERE iv.sessionId = es.id) AS invigilatorCount
    FROM exam_sessions es LEFT JOIN seat_allocations sa ON sa.sessionId = es.id
    WHERE es.termId = ?
    GROUP BY es.id ORDER BY es.examDate, es.startTime`).all(term.id);
}

function getSessionDetail(sessionId) {
  const session = db.prepare(`SELECT * FROM exam_sessions WHERE id = ?`).get(sessionId);
  if (!session) throw new Error('جلسه یافت نشد.');
  const seats = db.prepare(`
    SELECT sa.seatNumber, sa.hallId, sa.blockKey, cl.name AS hallName, cl.buildingName, cl.rowsCount, cl.colsCount, cl.totalCapacity AS capacity,
           c.title AS course, c.code, (su.firstName || ' ' || su.lastName) AS studentName, s.studentCode,
           e.id AS enrollmentId, e.status, s.id AS studentId
    FROM seat_allocations sa
    JOIN enrollments e ON e.id = sa.enrollmentId
    JOIN students s ON s.id = e.studentId JOIN users su ON su.id = s.userId
    JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId
    JOIN exam_halls cl ON cl.id = sa.hallId
    WHERE sa.sessionId = ?
    ORDER BY cl.totalCapacity DESC, sa.seatNumber`).all(sessionId);
  const blocks = [...new Set(seats.map(s => s.blockKey))].map(k => {
    const bs = seats.filter(s => s.blockKey === k);
    return { key: k, course: bs[0].course, code: bs[0].code, count: bs.length, seatRange: `${Math.min(...bs.map(x=>x.seatNumber))}–${Math.max(...bs.map(x=>x.seatNumber))}` };
  });
  const hallsMap = new Map();
  for (const s of seats) {
    if (!hallsMap.has(s.hallId)) hallsMap.set(s.hallId, { id: s.hallId, name: s.hallName, building: s.buildingName, rows: s.rowsCount, cols: s.colsCount, capacity: s.capacity, seats: [] });
    hallsMap.get(s.hallId).seats.push(s);
  }
  const invigilators = db.prepare(`
    SELECT iv.*, (u.firstName || ' ' || u.lastName) AS name FROM invigilators iv
    JOIN staff st ON st.id = iv.staffId JOIN users u ON u.id = st.userId WHERE iv.sessionId = ?`).all(sessionId);
  return { session, blocks, halls: [...hallsMap.values()], invigilators };
}

function setInvigilator({ sessionId, hallId, staffId, role = 'PROCTOR', remove = false }) {
  return tx(() => {
    if (remove) {
      db.prepare(`DELETE FROM invigilators WHERE sessionId = ? AND hallId = ? AND staffId = ?`).run(sessionId, hallId, staffId);
      return { ok: true, removed: true };
    }
    db.prepare(`INSERT OR REPLACE INTO invigilators (staffId, sessionId, hallId, role) VALUES (?,?,?,?)`).run(staffId, sessionId, hallId, role);
    return { ok: true };
  });
}

/* ═══════════ غیبت سیستمی + پیامک قالبی ═══════════ */
function markAbsences({ sessionId, enrollmentIds = [] }, actorUserId) {
  return tx(() => {
    const done = [];
    for (const eid of enrollmentIds) {
      const row = db.prepare(`
        SELECT e.id, e.status, s.id AS studentId, su.id AS userId, su.firstName, su.lastName, c.title AS course
        FROM seat_allocations sa
        JOIN enrollments e ON e.id = sa.enrollmentId
        JOIN students s ON s.id = e.studentId JOIN users su ON su.id = s.userId
        JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId
        WHERE sa.sessionId = ? AND e.id = ?`).get(sessionId, eid);
      if (!row || row.status !== 'REGISTERED') continue;
      db.prepare(`UPDATE enrollments SET status = 'ABSENT', absenceMarkedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(eid);
      const deadline = new Date(Date.now() + 48 * 3600 * 1000).toLocaleDateString('fa-IR');
      notify(row.userId, 'EXAM_ABSENCE', { firstName: row.firstName, lastName: row.lastName, courseName: row.course, deadlineDate: deadline });
      done.push(eid);
    }
    if (done.length) rbac.audit({ actorUserId, action: 'EXAM_ABSENCE_MARKED', entityType: 'session', entityId: sessionId, details: { count: done.length } });
    return { ok: true, marked: done.length };
  });
}

/** پایان مهلت ۴۸ ساعته بدون گواهی → اعمال سیاست آیین‌نامه (صفر قطعی یا حذف) */
function finalizeExpiredAbsences() {
  const expired = db.prepare(`
    SELECT e.id AS enrollmentId, e.studentId, s.userId, u.firstName, c.title AS course
    FROM enrollments e
    JOIN students s ON s.id = e.studentId JOIN users u ON u.id = s.userId
    JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId
    WHERE e.status = 'ABSENT' AND e.absenceMarkedAt IS NOT NULL
      AND e.absenceMarkedAt <= datetime('now', '-48 hours')`).all();
  const actions = [];
  const grades = require('./grades');
  for (const r of expired) {
    const hasOpen = db.prepare(`
      SELECT 1 FROM student_requests req
      JOIN process_definitions pd ON pd.id = req.processId
      WHERE pd.code = 'EXCUSED_ABSENCE' AND req.relatedEnrollmentId = ? AND req.status IN ('SUBMITTED','IN_REVIEW')`).get(r.enrollmentId);
    if (hasOpen) continue;
    tx(() => {
      const regs = require('./regulations');
      const reg = regs.getStudentRegulation(r.studentId);
      const policy = (reg && reg.rules && reg.rules.unexcused_absence_policy) || 'ZERO';
      if (policy === 'DROP') {
        db.prepare(`UPDATE enrollments SET status = 'DROPPED' WHERE id = ?`).run(r.enrollmentId);
      } else {
        db.prepare(`UPDATE enrollments SET gradeValue = 0, gradeStatus = 'FINALIZED' WHERE id = ?`).run(r.enrollmentId);
      }
      notify(r.userId, 'EXCUSE_REJECTED', { firstName: r.firstName, course: r.course });
      const termId = db.prepare(`SELECT termId FROM course_offerings o JOIN enrollments e ON e.offeringId = o.id WHERE e.id = ?`).get(r.enrollmentId)?.termId;
      if (termId) grades.checkAndCloseStudentTerm(r.studentId, termId);
      actions.push({ enrollmentId: r.enrollmentId, applied: policy });
    });
  }
  return actions;
}

/** درخواست غیبت موجه (دانشجو — تا ۴۸ ساعت) */
function submitExcuse(studentId, enrollmentId, message, actorUserId) {
  const e = db.prepare(`
    SELECT e.*, c.title AS course FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId
    WHERE e.id = ? AND e.studentId = ?`).get(enrollmentId, studentId);
  if (!e) throw new Error('ثبت‌نام یافت نشد.');
  if (e.status !== 'ABSENT') throw new Error('این درس غیبت ثبت‌شده ندارد.');
  if (!e.absenceMarkedAt || Date.now() - new Date(e.absenceMarkedAt + 'Z').getTime() > 48 * 3600 * 1000)
    throw new Error('مهلت ۴۸ ساعته ارائه گواهی گذشته است.');
  const open = db.prepare(`
    SELECT 1 FROM student_requests req JOIN process_definitions pd ON pd.id = req.processId
    WHERE pd.code = 'EXCUSED_ABSENCE' AND req.relatedEnrollmentId = ? AND req.status IN ('SUBMITTED','IN_REVIEW')`).get(enrollmentId);
  if (open) throw new Error('درخواست گواهی قبلاً ثبت شده و در حال بررسی است.');
  const workflow = require('./workflow');
  return workflow.submitRequest(studentId, 'EXCUSED_ABSENCE',
    { course: e.course, reason: message || 'گواهی پزشکی پیوست شد.' },
    { studentId, autoCreated: false, relatedEnrollmentId: enrollmentId, actorUserId });
}

/* ═══════════ کارت ورود به جلسه (سه‌گلوگاهی) ═══════════ */
function getEntryCard(studentId) {
  const student = db.prepare(`
    SELECT s.*, (u.firstName || ' ' || u.lastName) AS name, u.nationalCode FROM students s JOIN users u ON u.id = s.userId WHERE s.id = ?`).get(studentId);
  if (!student) throw new Error('دانشجو یافت نشد.');
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();

  // گلوگاه ۱: مالی (تراز باید صفر/مثبت باشد)
  const bal = db.prepare(`SELECT v.balance FROM v_student_balance v WHERE v.studentId = ?`).get(studentId);
  const balance = bal ? Number(bal.balance) : 0;

  // گلوگاه ۲: ارزشیابی همه دروس دارای امتحان
  const unevaluated = db.prepare(`
    SELECT c.title FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId
    WHERE e.studentId = ? AND e.status = 'REGISTERED' AND e.hasEvaluated = 0 AND o.termId = ?
      AND EXISTS (SELECT 1 FROM schedules sc WHERE sc.offeringId = o.id AND sc.scheduleType = 'EXAM')`).all(studentId, term.id);

  // گلوگاه ۳: چیدمان صندلی
  const exams = db.prepare(`
    SELECT es.examDate, es.startTime, es.endTime, c.title AS course, c.code, o.groupNumber,
               cl.name AS hall, cl.buildingName, sa.seatNumber, (pu.firstName || ' ' || pu.lastName) AS professor
    FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId
    JOIN courses c ON c.id = o.courseId
    LEFT JOIN staff st ON st.id = o.professorId LEFT JOIN users pu ON pu.id = st.userId
    JOIN schedules sc ON sc.offeringId = o.id AND sc.scheduleType = 'EXAM'
    JOIN exam_sessions es ON es.termId = o.termId AND es.examDate = sc.examDate AND es.startTime = sc.startTime
    LEFT JOIN seat_allocations sa ON sa.enrollmentId = e.id AND sa.sessionId = es.id
    LEFT JOIN exam_halls cl ON cl.id = sa.hallId
    WHERE e.studentId = ? AND e.status = 'REGISTERED' AND o.termId = ?
    ORDER BY es.examDate, es.startTime`).all(studentId, term.id);

  const blockers = [];
  if (balance < 0) blockers.push({ type: 'FINANCE', message: `بدهی مالی: ${Math.abs(balance).toLocaleString('fa-IR')} ریال — پیش از دریافت کارت باید تسویه شود.` });
  for (const u of unevaluated) blockers.push({ type: 'EVALUATION', message: `ارزشیابی استاد درس «${u.title}» تکمیل نشده است.` });
  if (exams.some(x => x.seatNumber === null)) blockers.push({ type: 'SEATING', message: 'چیدمان صندلی برخی امتحان‌ها هنوز توسط اداره امتحانات تولید نشده است.' });

  return {
    ok: blockers.length === 0 && exams.length > 0, blockers,
    student: { name: student.name, studentCode: student.studentCode, nationalCode: student.nationalCode },
    term: term.title, balance, exams
  };
}

module.exports = {
  generateSeating, getSessions, getSessionDetail, setInvigilator,
  markAbsences, finalizeExpiredAbsences, submitExcuse, getEntryCard
};
