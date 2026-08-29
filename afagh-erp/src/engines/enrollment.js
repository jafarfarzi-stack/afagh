'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  خط لوله اعتبارسنجی انتخاب واحد (Enrollment Validation Pipeline)
 *  ۵ فیلتر مطابق طرح:
 *   1) گیت مالی (علی‌الحساب ترم)
 *   2) وضعیت دانشجو + بازه انتخاب واحد
 *   3) سقف/کف واحد (موتور آیین‌نامه‌ها + سهمیه + ترم آخر + تابستان)
 *   4) پیش‌نیاز/هم‌نیاز (درخت منطقی JSON) → خطای «نرم» قابل ارجاع به شورا
 *   5) تداخل زمانی کلاس و امتحان → خطای «نرم» قابل ارجاع به شورا
 *  خطاهای سخت = رد قطعی | خطاهای نرم = ثبت PENDING_COUNCIL + پرونده گردش کار
 * ══════════════════════════════════════════════════════════════════════
 */
const { db, tx } = require('../db');
const { getUnitLimits } = require('./regulations');

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

function getOfferingFull(offeringId) {
  return db.prepare(`
    SELECT o.*, c.code, c.title, c.units, c.gradingType, c.affectsGpa,
           p.userId AS profUserId, u.firstName AS profFirst, u.lastName AS profLast,
           t.termCode, t.title AS termTitle, t.isCurrent, t.isEnrollmentOpen, t.isSummer
    FROM course_offerings o
    JOIN courses c ON c.id = o.courseId
    JOIN academic_terms t ON t.id = o.termId
    LEFT JOIN staff p ON p.id = o.professorId
    LEFT JOIN users u ON u.id = p.userId
    WHERE o.id = ?`).get(offeringId);
}

function getOfferingSchedules(offeringId) {
  return db.prepare(`SELECT * FROM schedules WHERE offeringId = ?`).all(offeringId);
}

/** ‌ارزیابی درخت منطقی پیش‌نیاز: {"operator":"AND"|"OR","conditions":[{course:"code",minGrade:10}, ...]} */
function evaluateLogicTree(node, passedMap) {
  if (!node || typeof node !== 'object') return { ok: true, missing: [] };
  const conds = node.conditions || [];
  const results = conds.map(c => {
    if (c.course) {
      const rec = passedMap.get(c.course);
      const ok = !!rec && (c.minGrade ? rec.grade >= c.minGrade : true);
      return { ok, missing: ok ? [] : [c.course] };
    }
    if (c.operator) { const sub = evaluateLogicTree(c, passedMap); return sub; }
    return { ok: true, missing: [] };
  });
  const op = (node.operator || 'AND').toUpperCase();
  if (op === 'AND') {
    return { ok: results.every(r => r.ok), missing: results.flatMap(r => r.missing) };
  }
  return { ok: results.some(r => r.ok), missing: results.every(r => !r.ok) ? results.flatMap(r => r.missing) : [] };
}

/** نقشه دروس پاس‌شده دانشجو (code → grade) */
function buildPassedMap(studentId) {
  const rows = db.prepare(`
    SELECT c.code, e.gradeValue, e.gradeStatus, e.status, c.gradingType
    FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId
    JOIN courses c ON c.id = o.courseId
    WHERE e.studentId = ?`).all(studentId);
  const { getStudentRegulation, resolvePassingGrade } = require('./regulations');
  const reg = getStudentRegulation(studentId);
  const map = new Map();
  for (const r of rows) {
    if (r.gradeStatus !== 'FINALIZED') continue;
    const passing = resolvePassingGradeByCode(r.code, reg);
    const passed = r.gradingType === 'DESCRIPTIVE' ? r.gradeValue === 1 : Number(r.gradeValue) >= passing;
    if (passed && (!map.has(r.code) || map.get(r.code).grade < Number(r.gradeValue))) {
      map.set(r.code, { grade: Number(r.gradeValue) });
    }
  }
  return map;
}
function resolvePassingGradeByCode(code, reg) {
  const c = db.prepare(`SELECT id FROM courses WHERE code = ?`).get(code);
  if (c) return resolvePassingGradeSafe(c.id, reg);
  return 10;
}
function resolvePassingGradeSafe(courseId, reg) {
  try { return require('./regulations').resolvePassingGrade(courseId, reg); }
  catch { return 10; }
}

/** تداخل بازه زمانی */
function overlaps(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }

/**
 * ثبت نهایی سبد — خروجی: {enrolled:[], waitlisted:[], pendingCouncil:[], hardErrors:[], softErrors:[]}
 * softErrors => اگر allowCouncil=true و کاربر بخواهد، پرونده BMP ساخته می‌شود
 */
function submitEnrollment(studentId, offeringIds, { allowCouncil = false } = {}) {
  return tx(() => {
    const result = { enrolled: [], waitlisted: [], pendingCouncil: [], hardErrors: [], softErrors: [], silentBilling: [] };

    const student = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId);
    if (!student) throw new Error('دانشجو یافت نشد');
    if (student.status === 'BLOCKED_MILITARY') {
      result.hardErrors.push('قفل نظام وظیفه: معافیت تحصیلی شما منقضی شده است. پس از دریافت تمدید از سامانه سخا، انتخاب واحد به‌طور خودکار بازگشایی می‌شود.');
      return result;
    }
    if (student.status === 'BLOCKED_COMMISSION') {
      result.hardErrors.push('وضعیت شما مسدود است (نیازمند مجوز کمیسیون موارد خاص). درخواست ادامه تحصیل در بخش درخواست‌ها را ببینید.');
      return result;
    }
    if (student.status !== 'ACTIVE') { result.hardErrors.push('وضعیت تحصیلی فعال نیست.'); return result; }

    const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
    if (!term || !term.isEnrollmentOpen) { result.hardErrors.push('بازه انتخاب واحد برای ترم جاری باز نیست.'); return result; }

    // ── فیلتر ۱: گیت مالی (علی‌الحساب)
    const fc = db.prepare(`SELECT * FROM financial_clearances WHERE studentId = ? AND termId = ?`).get(studentId, term.id);
    if (!fc || !fc.isCleared) {
      result.hardErrors.push('گیت مالی: پیش از ورود به سبد، پرداخت علی‌الحساب ترم الزامی است (ماژول مالی).');
      return result;
    }

    // دروس فعلی (قطعی یا در انتظار شورا) برای محاسبه واحد
    const existing = db.prepare(`
      SELECT o.id, c.units FROM enrollments e
      JOIN course_offerings o ON o.id = e.offeringId
      JOIN courses c ON c.id = o.courseId
      WHERE e.studentId = ? AND e.status IN ('REGISTERED','PENDING_COUNCIL') AND o.termId = ?`)
      .all(studentId, term.id);
    const existingIds = new Set(existing.map(e => e.id));
    let totalUnits = existing.reduce((a, e) => a + Number(e.units), 0);

    const limits = getUnitLimits(studentId, term);
    const newIds = [...new Set(offeringIds)].filter(id => !existingIds.has(id));
    const offerings = newIds.map(getOfferingFull).filter(Boolean);

    // پیش‌محاسبه سبد نهایی برای تشخیص تداخل
    const allSchedules = [];
    for (const id of existingIds) allSchedules.push(...getOfferingSchedules(id).map(s => ({ ...s, offeringId: id })));

    const passedMap = buildPassedMap(studentId);

    // ── فیلتر ۳: سقف واحد (خطای سخت) — روی کل سبد درخواستی
    const basketUnits = offerings.reduce((a, o) => a + Number(o.units), 0);
    if (totalUnits + basketUnits > limits.maxUnits) {
      result.hardErrors.push(`سقف واحد شما در این ترم ${limits.maxUnits} واحد است؛ سبد درخواستی ${totalUnits + basketUnits} واحد دارد (${limits.reasons.join(' + ')}). سبد را اصلاح کنید.`);
      return result;
    }

    for (const off of offerings) {
      const units = Number(off.units);

      // ── فیلتر ۲ب: تکرار یک درس در ترم (خطای سخت)
      const dup = db.prepare(`
        SELECT c.title FROM enrollments e
        JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId
        WHERE e.studentId = ? AND o.termId = ? AND o.courseId = ? AND e.status IN ('REGISTERED','WAITLISTED','PENDING_COUNCIL')`)
        .get(studentId, term.id, off.courseId);
      if (dup) {
        result.hardErrors.push(`درس «${dup.title}» قبلاً در این ترم (در گروهی دیگر) برای شما ثبت شده است.`);
        continue;
      }

      // ایمنی دوم: سقف واحد در حین پردازش (شامل دروس ارجاع‌شده به شورا)
      if (totalUnits + units > limits.maxUnits) {
        result.hardErrors.push(`درس «${off.title}»: سقف واحد شما ${limits.maxUnits} است (${limits.reasons.join(' + ')}).`);
        continue;
      }

      const scheds = getOfferingSchedules(off.id);

      // ── فیلتر ۵: تداخل زمانی (خطای نرم)
      const clashes = [];
      for (const s of scheds) {
        if (s.scheduleType !== 'CLASS') continue;
        for (const prev of allSchedules) {
          if (prev.scheduleType === 'CLASS' && prev.dayOfWeek === s.dayOfWeek && overlaps(s.startTime, s.endTime, prev.startTime, prev.endTime)) {
            clashes.push({ type: 'CLASS', with: prev.offeringId });
          }
        }
      }
      // تداخل امتحان
      const examDates = {};
      for (const s of scheds) if (s.scheduleType === 'EXAM') (examDates[s.offeringId] = examDates[s.offeringId] || []).push(s);
      const existingExams = db.prepare(`
        SELECT sc.* FROM schedules sc
        JOIN course_offerings o ON o.id = sc.offeringId
        JOIN enrollments e ON e.offeringId = o.id
        WHERE e.studentId = ? AND e.status IN ('REGISTERED','PENDING_COUNCIL') AND sc.scheduleType = 'EXAM'`)
        .all(studentId);
      const examClashes = [];
      for (const s of scheds) {
        if (s.scheduleType !== 'EXAM') continue;
        for (const prev of existingExams) {
          if (prev.examDate === s.examDate && overlaps(s.startTime, s.endTime, prev.startTime, prev.endTime)) {
            examClashes.push({ type: 'EXAM', date: s.examDate });
          }
        }
      }

      // ── فیلتر ۴: پیش‌نیاز (خطای نرم)
      const rules = db.prepare(`
        SELECT cr.* FROM course_rules cr
        LEFT JOIN syllabuses sy ON sy.id = cr.syllabusId
        LEFT JOIN students s ON s.id = ?
        WHERE cr.courseId = ?
          AND (cr.syllabusId IS NULL OR (sy.majorId = s.majorId AND s.entryYear >= sy.entryYearStart
               AND (sy.entryYearEnd IS NULL OR s.entryYear <= sy.entryYearEnd)))`)
        .all(studentId, off.courseId);
      const prereqRule = rules.find(r => r.ruleType === 'PREREQ');
      let prereqFail = null;
      if (prereqRule) {
        const ev = evaluateLogicTree(JSON.parse(prereqRule.logicTree), passedMap);
        if (!ev.ok) prereqFail = ev.missing.map(code => {
          const c = db.prepare(`SELECT title FROM courses WHERE code = ?`).get(code);
          return c ? c.title : code;
        });
      }

      const hasSoftError = clashes.length > 0 || examClashes.length > 0 || !!prereqFail;

      // ── فیلتر ۲: ظرفیت (اتمیک)
      const row = db.prepare(`SELECT enrolledCount, capacity, waitlistCapacity FROM course_offerings WHERE id = ?`).get(off.id);
      const isFull = row.enrolledCount >= row.capacity;
      const wlFull = row.enrolledCount + (row.waitlistCapacity ? 1 : 0) >= row.capacity + row.waitlistCapacity;

      if (hasSoftError && allowCouncil) {
        // ── خطای نرم → ثبت PENDING_COUNCIL + پرونده گردش کار (شورای آموزشی)
        const workflow = require('./workflow');
        const reasons = [];
        if (prereqFail) reasons.push(`عدم پیش‌نیاز: ${prereqFail.join('، ')}`);
        if (clashes.length) reasons.push('تداخل زمانی کلاس');
        if (examClashes.length) reasons.push('تداخل امتحانی');
        const ins = db.prepare(`INSERT INTO enrollments (studentId, offeringId, status, registeredAt) VALUES (?,?, 'PENDING_COUNCIL', CURRENT_TIMESTAMP)`).run(studentId, off.id);
        const req = workflow.submitRequest(studentId, 'PREREQ_WAIVER', {
          offeringId: off.id, offeringTitle: off.title, reasons
        }, { studentId, autoCreated: false, relatedEnrollmentId: ins.lastInsertRowid });
        db.prepare(`UPDATE enrollments SET workflowRequestId = ? WHERE id = ?`).run(req.id, ins.lastInsertRowid);
        result.pendingCouncil.push({ offeringId: off.id, title: off.title, reasons, trackingCode: req.trackingCode });
        totalUnits += units;
        for (const s of scheds) allSchedules.push(s);
        continue;
      }
      if (hasSoftError) {
        const msg = `درس «${off.title}»: ${[prereqFail ? `نیازمند پیش‌نیاز ${prereqFail.join('، ')}` : null, clashes.length ? 'تداخل ساعت کلاس' : null, examClashes.length ? 'تداخل امتحانی' : null].filter(Boolean).join(' | ')}`;
        result.softErrors.push({ offeringId: off.id, title: off.title, message: msg, canCouncil: true });
        continue;
      }

      if (isFull && !wlFull) {
        // لیست انتظار — رتبه بر اساس زمان ثبت (عدالت)
        const pos = db.prepare(`SELECT COUNT(*) AS c FROM enrollments WHERE offeringId = ? AND status = 'WAITLISTED'`).get(off.id).c + 1;
        db.prepare(`INSERT INTO enrollments (studentId, offeringId, status, waitlistPosition) VALUES (?,?, 'WAITLISTED', ?)`).run(studentId, off.id, pos);
        result.waitlisted.push({ offeringId: off.id, title: off.title, position: pos });
        continue;
      }
      if (isFull && wlFull) {
        result.hardErrors.push(`درس «${off.title}»: ظرفیت و لیست انتظار تکمیل است.`);
        continue;
      }

      db.prepare(`UPDATE course_offerings SET enrolledCount = enrolledCount + 1 WHERE id = ?`).run(off.id);
      db.prepare(`INSERT INTO enrollments (studentId, offeringId, status) VALUES (?,?, 'REGISTERED')`).run(studentId, off.id);

      // ── Silent Billing: هزینه متغیر در پس‌زمینه به دفتر کل اضافه می‌شود (بدون مسدودسازی)
      const fin = db.prepare(`SELECT perUnitTuition FROM term_financial_rules WHERE termId = ? AND degreeLevelId = ?`).get(term.id, student.degreeLevelId);
      if (fin && fin.perUnitTuition > 0) {
        const amount = fin.perUnitTuition * units;
        db.prepare(`INSERT INTO student_ledger (studentId, termId, transactionType, amount, description, referenceId) VALUES (?,?, 'DEBIT', ?, ?, ?)`)
          .run(studentId, term.id, amount, `هزینه متغیر درس ${off.title} (${units} واحد) — Silent Billing`, off.id);
        result.silentBilling.push({ offeringId: off.id, amount });
      }

      totalUnits += units;
      for (const s of scheds) allSchedules.push(s);
      result.enrolled.push({ offeringId: off.id, code: off.code, title: off.title, units, professor: `${off.profFirst || ''} ${off.profLast || ''}`.trim() });
    }

    // ── کف واحد (فقط هشدار، نه مسدودکننده)
    if (result.enrolled.length > 0 && totalUnits < limits.minUnits && !term.isSummer) {
      result.hardErrors.push(`⚠ کف واحد: مجموع واحدهای ترم شما ${totalUnits} است؛ کمتر از کف مجاز (${limits.minUnits}) — تا پایان حذف و اضافه تکمیل کنید.`);
    }
    return result;
  });
}

/** حذف درس + ارتقای خودکار لیست انتظار (Waitlist Auto-Promotion) */
function dropEnrollment(studentId, offeringId) {
  return tx(() => {
    const enr = db.prepare(`SELECT * FROM enrollments WHERE studentId = ? AND offeringId = ? AND status IN ('REGISTERED','WAITLISTED','PENDING_COUNCIL')`).get(studentId, offeringId);
    if (!enr) return { ok: false, message: 'ثبت‌نامی برای حذف یافت نشد.' };

    if (enr.workflowRequestId) {
      db.prepare(`UPDATE student_requests SET status = 'CANCELED', updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('SUBMITTED','IN_REVIEW')`).run(enr.workflowRequestId);
    }
    db.prepare(`UPDATE enrollments SET status = 'DROPPED' WHERE id = ?`).run(enr.id);

    if (enr.status === 'REGISTERED') {
      db.prepare(`UPDATE course_offerings SET enrolledCount = MAX(enrolledCount - 1, 0) WHERE id = ?`).run(offeringId);
      // بازپرداخت هزینه متغیر (برداشت از دفتر کل)
      const off = getOfferingFull(offeringId);
      const fin = db.prepare(`SELECT perUnitTuition FROM term_financial_rules WHERE termId = ? LIMIT 1`).get(off.termId);
      if (fin && fin.perUnitTuition > 0) {
        db.prepare(`INSERT INTO student_ledger (studentId, termId, transactionType, amount, description, referenceId) VALUES (?,?, 'CREDIT', ?, ?, ?)`)
          .run(studentId, off.termId, fin.perUnitTuition * Number(off.units), `ابطال هزینه متغیر درس ${off.title} (حذف درس)`, offeringId);
      }
      // ── ارتقای خودکار نفر بعدی لیست انتظار
      const next = db.prepare(`SELECT * FROM enrollments WHERE offeringId = ? AND status = 'WAITLISTED' ORDER BY waitlistPosition LIMIT 1`).get(offeringId);
      if (next) {
        db.prepare(`UPDATE enrollments SET status = 'REGISTERED', waitlistPosition = NULL WHERE id = ?`).run(next.id);
        db.prepare(`UPDATE course_offerings SET enrolledCount = enrolledCount + 1 WHERE id = ?`).run(offeringId);
        const stu = db.prepare(`SELECT userId FROM students WHERE id = ?`).get(next.studentId);
        notify(stu.userId, 'WAITLIST_PROMOTED', { course: off.title });
        return { ok: true, promoted: { studentId: next.studentId, course: off.title } };
      }
    }
    return { ok: true };
  });
}

/** ثبت رویداد اعلان با قالب پویا از notification_templates */
function notify(userId, eventCode, vars = {}) {
  const tpl = db.prepare(`SELECT * FROM notification_templates WHERE eventCode = ? AND isActive = 1`).get(eventCode);
  let text = `[${eventCode}]`;
  if (tpl) {
    text = tpl.templateText.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `«${k}»`);
  }
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`).run(userId, eventCode, JSON.stringify({ text, vars }));
}

module.exports = { submitEnrollment, dropEnrollment, getOfferingFull, getOfferingSchedules, evaluateLogicTree, DAY_NAMES };
