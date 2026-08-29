'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  موتور گردش کار پویا (BPM Engine) + SLA + Timeout Action
 *  مطابق طرح:
 *   - process_definitions / process_steps / process_transitions = داده، نه کد
 *   - هر مرحله: نقش مسئول + SLA (ساعت) + اقدام در صورت انقضا:
 *       ESCALATE (ارجاع به بالاتر) / AUTO_APPROVE / AUTO_REJECT / NOTIFY
 *   - request_step_logs: assignedAt / firstViewedAt / completedAt / slaStatus
 *     → مبنای گزارش گلوگاه و KPI کارمندان (MTTR، پایبندی به مهلت، ...)
 * ══════════════════════════════════════════════════════════════════════
 */
const crypto = require('crypto');
const { db, tx } = require('../db');

function trackingCode() {
  return 'AF-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

/** ثبت درخواست جدید و ورود به مرحله اول */
function submitRequest(studentId, processCode, formData = {}, opts = {}) {
  return tx(() => {
    const proc = db.prepare(`SELECT * FROM process_definitions WHERE code = ? AND isActive = 1`).get(processCode);
    if (!proc) throw new Error(`فرآیند «${processCode}» تعریف نشده است — مدیر سیستم می‌تواند آن را بسازد.`);
    const step = db.prepare(`SELECT * FROM process_steps WHERE processId = ? ORDER BY stepOrder LIMIT 1`).get(proc.id);
    const ins = db.prepare(`
      INSERT INTO student_requests (trackingCode, studentId, processId, currentStepId, formData, status, autoCreated, relatedEnrollmentId)
      VALUES (?,?,?,?,?, 'SUBMITTED', ?, ?)`)
      .run(trackingCode(), studentId, proc.id, step.id, JSON.stringify(formData), opts.autoCreated ? 1 : 0, opts.relatedEnrollmentId || null);
    const reqId = ins.lastInsertRowid;
    db.prepare(`INSERT INTO request_step_logs (requestId, stepId, assignedAt) VALUES (?,?, CURRENT_TIMESTAMP)`).run(reqId, step.id);
    return { id: reqId, trackingCode: db.prepare(`SELECT trackingCode FROM student_requests WHERE id = ?`).get(reqId).trackingCode };
  });
}

/** کارتابل یک نقش (یا شخص) — درخواست‌های در انتظار اقدام */
function getInbox({ roleCode, staffId }) {
  const rows = db.prepare(`
    SELECT r.id, r.trackingCode, r.status, r.formData, r.createdAt,
           ps.title AS stepTitle, ps.slaHours, ps.timeoutAction, ps.id AS stepId,
           l.assignedAt,
           u.firstName, u.lastName, s.studentCode, s.quotaType,
           (SELECT title FROM process_definitions pd WHERE pd.id = r.processId) AS processTitle
    FROM student_requests r
    JOIN process_steps ps ON ps.id = r.currentStepId
    LEFT JOIN request_step_logs l ON l.requestId = r.id AND l.stepId = ps.id AND l.completedAt IS NULL
    JOIN students s ON s.id = r.studentId
    JOIN users u ON u.id = s.userId
    WHERE r.status IN ('SUBMITTED','IN_REVIEW','RETURNED')
      AND (ps.roleCode = ? OR ps.assigneeStaffId = ?)
    ORDER BY r.createdAt`).all(roleCode || '_', staffId || -1);
  return rows.map(r => {
    const assigned = r.assignedAt ? new Date(r.assignedAt.replace(' ', 'T') + 'Z') : null;
    let deadline = null, minutesLeft = null, slaState = 'NO_SLA';
    if (assigned && r.slaHours) {
      deadline = new Date(assigned.getTime() + r.slaHours * 3600e3);
      minutesLeft = Math.round((deadline - Date.now()) / 60e3);
      slaState = minutesLeft <= 0 ? 'BREACHED' : minutesLeft < r.slaHours * 60 * 0.2 ? 'WARNING' : 'ON_TIME';
    }
    return { ...r, formDataParsed: JSON.parse(r.formData || '{}'), minutesLeft, slaState };
  });
}

/** اقدام کارشناس روی درخواست (APPROVE / REJECT / RETURN) + ثبت لاگ و SLA */
function actOnRequest(requestId, actorStaffId, action, note = '') {
  return tx(() => {
    const req = db.prepare(`SELECT * FROM student_requests WHERE id = ?`).get(requestId);
    if (!req) throw new Error('درخواست یافت نشد');
    if (!['SUBMITTED', 'IN_REVIEW', 'RETURNED'].includes(req.status)) throw new Error('این درخواست قبلاً بسته شده است.');
    const step = db.prepare(`SELECT * FROM process_steps WHERE id = ?`).get(req.currentStepId);

    const log = db.prepare(`SELECT * FROM request_step_logs WHERE requestId = ? AND stepId = ? AND completedAt IS NULL`).get(requestId, step.id);
    const assignedAt = log ? new Date(log.assignedAt.replace(' ', 'T') + 'Z') : new Date();
    const dur = Math.round((Date.now() - assignedAt) / 60e3);
    const slaStatus = step.slaHours ? (dur <= step.slaHours * 60 ? 'ON_TIME' : 'BREACHED') : 'NO_SLA';

    const trans = db.prepare(`SELECT * FROM process_transitions WHERE stepId = ? AND action = ?`).get(step.id, action);
    if (!trans) throw new Error(`اقدام «${action}» برای این مرحله تعریف نشده است.`);

    db.prepare(`UPDATE request_step_logs SET completedAt = CURRENT_TIMESTAMP, actorStaffId = ?, action = ?, note = ?, durationMinutes = ?, slaStatus = ?
                WHERE id = ?`).run(actorStaffId, action, note, dur, slaStatus, log.id);

    if (trans.isFinal) {
      db.prepare(`UPDATE student_requests SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'RETURNED', requestId);
      onFinalized(requestId, action);
      return { ok: true, final: true, status: action };
    }
    const next = db.prepare(`SELECT * FROM process_steps WHERE id = ?`).get(trans.toStepId);
    db.prepare(`UPDATE student_requests SET currentStepId = ?, status = 'IN_REVIEW', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(next.id, requestId);
    db.prepare(`INSERT INTO request_step_logs (requestId, stepId, assignedAt) VALUES (?,?, CURRENT_TIMESTAMP)`).run(requestId, next.id);
    return { ok: true, final: false, movedTo: next.title };
  });
}

/** پس از نهایی شدن درخواست — اثرگذاری خودکار (مثلاً فعال شدن ثبت‌نام PENDING_COUNCIL) */
function stuFirstName(stu) {
  return db.prepare(`SELECT firstName FROM users WHERE id = ?`).get(stu.userId)?.firstName || '';
}

function onFinalized(requestId, action) {
  const req = db.prepare(`SELECT * FROM student_requests WHERE id = ?`).get(requestId);
  const stu = db.prepare(`SELECT * FROM students WHERE id = ?`).get(req.studentId);

  // ── غیبت موجه امتحان: تایید → حذف درس از کارنامه / رد → مانده برای سیاست صفر
  const pExcused = db.prepare(`SELECT id FROM process_definitions WHERE code = 'EXCUSED_ABSENCE'`).get()?.id;
  if (req.processId === pExcused && req.relatedEnrollmentId) {
    const enr = db.prepare(`SELECT e.*, c.title AS course FROM enrollments e
      JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId WHERE e.id = ?`).get(req.relatedEnrollmentId);
    if (enr) {
      if (action === 'APPROVE' && enr.status === 'ABSENT') {
        db.prepare(`UPDATE enrollments SET status = 'DROPPED' WHERE id = ?`).run(enr.id);
        notifyUser(stu.userId, 'EXCUSE_ACCEPTED', { firstName: stuFirstName(stu), course: enr.course });
      } else if (action === 'REJECT') {
        notifyUser(stu.userId, 'EXCUSE_REJECTED', { firstName: stuFirstName(stu), course: enr.course });
      }
    }
  }
  if (req.processId === db.prepare(`SELECT id FROM process_definitions WHERE code = 'PREREQ_WAIVER'`).get()?.id) {
    if (action === 'APPROVE' && req.relatedEnrollmentId) {
      const enr = db.prepare(`SELECT * FROM enrollments WHERE id = ?`).get(req.relatedEnrollmentId);
      if (enr && enr.status === 'PENDING_COUNCIL') {
        db.prepare(`UPDATE enrollments SET status = 'REGISTERED' WHERE id = ?`).run(enr.id);
        db.prepare(`UPDATE course_offerings SET enrolledCount = enrolledCount + 1 WHERE id = ?`).run(enr.offeringId);
        const off = db.prepare(`
          SELECT c.title, o.termId, c.units FROM course_offerings o
          JOIN courses c ON c.id = o.courseId WHERE o.id = ?`).get(enr.offeringId);
        const fin = db.prepare(`SELECT perUnitTuition FROM term_financial_rules WHERE termId = ? LIMIT 1`).get(off.termId);
        if (fin && fin.perUnitTuition > 0) {
          db.prepare(`INSERT INTO student_ledger (studentId, termId, transactionType, amount, description, referenceId) VALUES (?,?, 'DEBIT', ?, ?, ?)`)
            .run(req.studentId, off.termId, fin.perUnitTuition * Number(off.units), `هزینه متغیر درس ${off.title} (پس از تایید شورا)`, enr.offeringId);
        }
        require('./enrollment'); // برای notify
        notifyUser(stu.userId, 'COUNCIL_APPROVED', { course: off.title });
      }
    } else if (action === 'REJECT' && req.relatedEnrollmentId) {
      db.prepare(`UPDATE enrollments SET status = 'REJECTED' WHERE id = ? AND status = 'PENDING_COUNCIL'`).run(req.relatedEnrollmentId);
      notifyUser(stu.userId, 'COUNCIL_REJECTED', {});
    }
  }
  if (req.processId === db.prepare(`SELECT id FROM process_definitions WHERE code = 'COMMISSION_PERMIT'`).get()?.id && action === 'APPROVE') {
    // بازگشایی پنل پس از رای کمیسیون: ارفاق + فعال شدن وضعیت
    const fd = JSON.parse(req.formData || '{}');
    db.prepare(`UPDATE students SET status = 'ACTIVE',
                extraAllowedSemesters = extraAllowedSemesters + ?,
                extraAllowedProbations = extraAllowedProbations + ?
                WHERE id = ?`).run(Number(fd.extraSemesters || 1), Number(fd.extraProbations || 0), req.studentId);
    notifyUser(stu.userId, 'COMMISSION_APPROVED', {});
  }
}
function notifyUser(userId, eventCode, vars) {
  const tpl = db.prepare(`SELECT * FROM notification_templates WHERE eventCode = ? AND isActive = 1`).get(eventCode);
  let text = `[${eventCode}]`;
  if (tpl) text = tpl.templateText.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`).run(userId, eventCode, JSON.stringify({ text }));
}

/**
 * ── زمان‌بند SLA (Background Job مطابق طرح) ──
 * هر مرحله‌ای که از مهلتش بگذشد → اعمال TimeoutAction:
 *   AUTO_REJECT / AUTO_APPROVE / ESCALATE / NOTIFY
 * @returns تعداد اقدامات اعمال‌شده
 */
function runSlaSweeper() {
  const rows = db.prepare(`
    SELECT r.id AS requestId, ps.id AS stepId, ps.timeoutAction, ps.roleCode, l.assignedAt, ps.slaHours,
           (SELECT id FROM process_steps ps2 WHERE ps2.processId = ps.processId AND ps2.stepOrder > ps.stepOrder ORDER BY ps2.stepOrder LIMIT 1) AS nextStepId
    FROM student_requests r
    JOIN process_steps ps ON ps.id = r.currentStepId
    JOIN request_step_logs l ON l.requestId = r.id AND l.stepId = ps.id AND l.completedAt IS NULL
    WHERE r.status IN ('SUBMITTED','IN_REVIEW')
      AND ps.slaHours IS NOT NULL
      AND DATETIME(l.assignedAt, '+' || ps.slaHours || ' hours') <= DATETIME('now')`).all();

  let actions = [];
  for (const r of rows) {
    try {
      const act = r.timeoutAction || 'NOTIFY';
      if (act === 'AUTO_REJECT' || act === 'AUTO_APPROVE') {
        const action = act === 'AUTO_REJECT' ? 'REJECT' : 'APPROVE';
        actOnRequest(r.requestId, null, action, `اقدام خودکار سیستم به دلیل انقضای مهلت (SLA ${r.slaHours} ساعت)`);
      } else if (act === 'ESCALATE' && r.nextStepId) {
        tx(() => {
          const log = db.prepare(`SELECT id FROM request_step_logs WHERE requestId = ? AND stepId = ? AND completedAt IS NULL`).get(r.requestId, r.stepId);
          db.prepare(`UPDATE request_step_logs SET completedAt = CURRENT_TIMESTAMP, action = 'TIMEOUT_ESCALATED', durationMinutes = ?, slaStatus = 'BREACHED' WHERE id = ?`)
            .run(Math.round((Date.now() - new Date(r.assignedAt.replace(' ', 'T') + 'Z')) / 60e3), log.id);
          const next = db.prepare(`SELECT * FROM process_steps WHERE id = ?`).get(r.nextStepId);
          db.prepare(`UPDATE student_requests SET currentStepId = ?, status = 'IN_REVIEW', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(next.id, r.requestId);
          db.prepare(`INSERT INTO request_step_logs (requestId, stepId, assignedAt, note) VALUES (?,?, CURRENT_TIMESTAMP, 'ارجاع خودکار (Escalation)')`).run(r.requestId, next.id);
        })();
      } else {
        const req = db.prepare(`SELECT studentId FROM student_requests WHERE id = ?`).get(r.requestId);
        const stu = db.prepare(`SELECT userId FROM students WHERE id = ?`).get(req.studentId);
        notifyUser(stu.userId, 'SLA_WARNING', {});
      }
      actions.push({ requestId: r.requestId, applied: act });
    } catch (e) { actions.push({ requestId: r.requestId, error: e.message }); }
  }
  return actions;
}

/** KPI کارمندان — مبنای ارزیابی عملکرد و کشف گلوگاه (مطابق طرح) */
function getKpiReport() {
  return db.prepare(`
    SELECT st.id AS staffId, u.firstName, u.lastName, ps.title AS stepTitle,
           COUNT(*) AS handled,
           ROUND(AVG(l.durationMinutes), 1) AS avgMinutes,
           SUM(CASE WHEN l.slaStatus = 'ON_TIME' THEN 1 ELSE 0 END) AS onTime,
           SUM(CASE WHEN l.action LIKE 'TIMEOUT%' THEN 1 ELSE 0 END) AS escalations,
           ROUND(100.0 * SUM(CASE WHEN l.slaStatus = 'ON_TIME' THEN 1 ELSE 0 END) / COUNT(*), 1) AS slaPct
    FROM request_step_logs l
    JOIN process_steps ps ON ps.id = l.stepId
    LEFT JOIN staff st ON st.id = l.actorStaffId
    LEFT JOIN users u ON u.id = st.userId
    WHERE l.completedAt IS NOT NULL
    GROUP BY st.id, ps.title
    ORDER BY handled DESC`).all();
}

/** گزارش گلوگاه مراحل (Heatmap) */
function getBottlenecks() {
  return db.prepare(`
    SELECT ps.title AS stepTitle, pd.title AS processTitle,
           COUNT(*) AS total, ROUND(AVG(l.durationMinutes),1) AS avgMinutes,
           ps.slaHours,
           SUM(CASE WHEN l.slaStatus = 'BREACHED' THEN 1 ELSE 0 END) AS breached
    FROM request_step_logs l
    JOIN process_steps ps ON ps.id = l.stepId
    JOIN process_definitions pd ON pd.id = ps.processId
    WHERE l.completedAt IS NOT NULL
    GROUP BY ps.id ORDER BY avgMinutes DESC`).all();
}

module.exports = { submitRequest, getInbox, actOnRequest, runSlaSweeper, getKpiReport, getBottlenecks };
