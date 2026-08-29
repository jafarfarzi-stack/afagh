'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  سرور سامانه جامع آموزشی دانشگاه آفاق — فاز صفر
 *  REST API + پنل وب RTL (بدون وابستگی خارجی به جز better-sqlite3)
 * ══════════════════════════════════════════════════════════════════════
 */
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '8'; // قبل از اولین استفاده از threadpool (scrypt async)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, initSchema, verifyPasswordAsync, reopenIfReplaced } = require('./db');
const regs = require('./engines/regulations');
const gpaEngine = require('./engines/gpa');
const enrollment = require('./engines/enrollment');
const workflow = require('./engines/workflow');
const rbac = require('./engines/rbac');
const grades = require('./engines/grades');
const exams = require('./engines/exams');
const att = require('./engines/attendance');
const payroll = require('./engines/payroll');
const payRules = require('./engines/payRules');
const dr = require('./engines/directedReading');
const sakha = require('./engines/sakha');
const archive = require('./engines/archive');
const bi = require('./engines/bi');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// اطمینان از وجود اسکیما و داده
initSchema();
const hasStudent = db.prepare(`SELECT COUNT(*) AS c FROM students`).get().c;
if (!hasStudent) { console.log('⚙ دیتابیس خالی — اجرای seed...'); require('./db/seed'); }

// ─── زمان‌بند پس‌زمینه: اجرای SLA Sweeper هر ۱ دقیقه (Background Job طرح) ───
setInterval(() => {
  try { const a = workflow.runSlaSweeper(); if (a.length) console.log(`⏱ SLA Sweeper: ${a.length} اقدام خودکار`); } catch (e) { console.error('SLA sweeper:', e.message); }
  try { const g = grades.runGradeSlaSweeper(); if (g.length) console.log(`⏱ SLA نمرات: ${g.length} اقدام (ددلاین/اعتراض)`); } catch (e) { console.error('Grade SLA:', e.message); }
  try { const f = exams.finalizeExpiredAbsences(); if (f.length) console.log(`⏱ غیبت‌های منقضی: ${f.length} مورد`); } catch (e) { console.error('Absence finalizer:', e.message); }
  try { const d = dr.runDrDeadlineSweeper(); if (d.length) console.log(`🎯 یادآور معرفی‌به‌استاد: ${d.length} درس`); } catch (e) { console.error('DR sweeper:', e.message); }
  try { const m = sakha.runExpirySweeper(); if (m.length) console.log(`🪖 سخا: ${m.length} اقدام انقضا`); } catch (e) { console.error('Sakha sweeper:', e.message); }
}, 60 * 1000).unref();
// موتور تطبیق هوشمند حضور استاد (زنجیره + گیت اثر انگشت) — هر ۵ دقیقه
setInterval(() => {
  try { const a = att.runCorrelation(); if (a.length) console.log(`🖐 موتور تطبیق حضور: ${a.length} جلسه پردازش شد`); } catch (e) { console.error('Attendance correlator:', e.message); }
}, 5 * 60 * 1000).unref();

// ─── کمکی‌ها ───
const json = (res, code, data) => {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
const readBody = req => new Promise(resolve => {
  let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
});
const token2user = token => {
  if (!token) return null;
  const s = db.prepare(`SELECT * FROM sessions WHERE token = ? AND expiresAt > datetime('now')`).get(token);
  return s ? db.prepare(`SELECT * FROM users WHERE id = ?`).get(s.userId) : null;
};
const getStudent = userId => db.prepare(`SELECT * FROM students WHERE userId = ?`).get(userId);
const getStaff = userId => db.prepare(`SELECT * FROM staff WHERE userId = ?`).get(userId);

function auth(req, url) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (parseCookie(req.headers.cookie || '').token) || (url && url.searchParams.get('token'));
  return token2user(token);
}
function parseCookie(c) { return Object.fromEntries(c.split(';').map(p => p.trim().split('=').map(decodeURIComponent))); }

/** درصد باقیمانده ظرفیت و جزئیات ارائه‌ها */
function listOfferings(termId) {
  return db.prepare(`
    SELECT o.id, c.code, c.title, c.units, c.gradingType, o.groupNumber, o.capacity, o.waitlistCapacity,
           o.enrolledCount, o.sharedScheduleGroupKey, o.offeringType,
           (u.firstName || ' ' || u.lastName) AS professor,
           (SELECT GROUP_CONCAT(CASE sc.scheduleType WHEN 'CLASS'
              THEN 'کلاس: ' || CASE sc.dayOfWeek WHEN 0 THEN 'شنبه' WHEN 1 THEN 'یکشنبه' WHEN 2 THEN 'دوشنبه'
                   WHEN 3 THEN 'سه‌شنبه' WHEN 4 THEN 'چهارشنبه' WHEN 5 THEN 'پنجشنبه' ELSE 'جمعه' END || ' ' || sc.startTime || '-' || sc.endTime
              ELSE 'امتحان: ' || sc.examDate || ' ' || sc.startTime END, ' | ')
            FROM schedules sc WHERE sc.offeringId = o.id) AS scheduleText
    FROM course_offerings o
    JOIN courses c ON c.id = o.courseId
    LEFT JOIN staff p ON p.id = o.professorId
    LEFT JOIN users u ON u.id = p.userId
    WHERE o.termId = ? AND o.isActive = 1
    ORDER BY c.code, o.groupNumber`).all(termId);
}

// ─── مسیرهای API ───
const api = async (req, res, url) => {
  const user = auth(req, url);
  const body = url.method === 'POST' || url.method === 'PUT' ? await readBody(req) : {};
  const route = url.pathname;

  // ── احراز هویت
  if (route === '/api/auth/login' && url.method === 'POST') {
    const u = db.prepare(`SELECT * FROM users WHERE nationalCode = ?`).get(body.nationalCode);
    if (!u || !(await verifyPasswordAsync(body.password || '', u.passwordHash))) return json(res, 401, { error: 'کد ملی یا رمز عبور اشتباه است.' });
    if (!u.isActive) return json(res, 403, { error: 'حساب غیرفعال است.' });
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare(`INSERT INTO sessions (token, userId, expiresAt) VALUES (?,?, datetime('now','+2 days'))`).run(token, u.id);
    rbac.audit({ actorUserId: u.id, action: 'LOGIN', entityType: 'user', entityId: u.id, ipAddress: req.socket.remoteAddress });
    return json(res, 200, { token, user: { id: u.id, name: `${u.firstName} ${u.lastName}`, nationalCode: u.nationalCode } });
  }

  if (!user) return json(res, 401, { error: 'ابتدا وارد شوید.' });

  // ── پروفایل من
  if (route === '/api/me') {
    const student = getStudent(user.id);
    const staff = getStaff(user.id);
    return json(res, 200, {
      user: { id: user.id, name: `${user.firstName} ${user.lastName}`, nationalCode: user.nationalCode },
      roles: rbac.getRoles(user.id),
      student: student ? { ...student, studentCode: student.studentCode } : null,
      staff: staff ? { ...staff } : null
    });
  }

  // ── ترم جاری و ارائه‌ها
  if (route === '/api/offerings') {
    const t = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
    const list = listOfferings(t.id);
    // برای دانشجو: وضعیت هر ارائه نسبت به او + مسدود بودن‌ها
    let studentContext = null;
    const student = getStudent(user.id);
    if (student) {
      const limits = regs.getUnitLimits(student.id, t);
      const fc = db.prepare(`SELECT * FROM financial_clearances WHERE studentId = ? AND termId = ?`).get(student.id, t.id);
      const myEnr = db.prepare(`SELECT offeringId, status FROM enrollments WHERE studentId = ? AND status IN ('REGISTERED','WAITLISTED','PENDING_COUNCIL')`).all(student.id);
      const cart = db.prepare(`SELECT offeringId FROM cart_items WHERE studentId = ?`).all(student.id).map(c => c.offeringId);
      const currentUnits = db.prepare(`
        SELECT COALESCE(SUM(c.units),0) AS u FROM enrollments e
        JOIN course_offerings o ON o.id = e.offeringId JOIN courses c ON c.id = o.courseId
        WHERE e.studentId = ? AND e.status IN ('REGISTERED','PENDING_COUNCIL') AND o.termId = ?`).get(student.id, t.id).u;
      const tr = gpaEngine.computeTranscript(student.id);
      const eot = regs.evaluateEndOfTerm(student.id);
      studentContext = {
        limits, financialCleared: !!(fc && fc.isCleared), currentUnits,
        myEnrollments: Object.fromEntries(myEnr.map(e => [e.offeringId, e.status])),
        cart, gpa: tr?.overallGpa, passedUnits: tr?.totalPassedUnits,
        probationCount: eot.probationCount, blockedEvent: eot.event, studentStatus: student.status
      };
    }
    return json(res, 200, { term: t, offerings: list, studentContext });
  }

  // ── سبد و انتخاب واحد
  if (route === '/api/cart' && url.method === 'POST') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    if (body.offeringId && body.action === 'add')
      db.prepare(`INSERT OR IGNORE INTO cart_items (studentId, offeringId) VALUES (?,?)`).run(student.id, body.offeringId);
    if (body.offeringId && body.action === 'remove')
      db.prepare(`DELETE FROM cart_items WHERE studentId = ? AND offeringId = ?`).run(student.id, body.offeringId);
    return json(res, 200, { ok: true });
  }

  if (route === '/api/enroll/submit' && url.method === 'POST') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    try {
      const result = enrollment.submitEnrollment(student.id, body.offeringIds || [], { allowCouncil: !!body.allowCouncil });
      rbac.audit({ actorUserId: user.id, action: 'ENROLL_SUBMIT', entityType: 'student', entityId: student.id, details: { ids: body.offeringIds, allowCouncil: !!body.allowCouncil } });
      if (result.enrolled.length) db.prepare(`DELETE FROM cart_items WHERE studentId = ?`).run(student.id);
      return json(res, 200, result);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/enroll/drop' && url.method === 'POST') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    const r = enrollment.dropEnrollment(student.id, body.offeringId);
    rbac.audit({ actorUserId: user.id, action: 'ENROLL_DROP', entityType: 'offering', entityId: body.offeringId });
    return json(res, 200, r);
  }

  // ── کارنامه
  if (route === '/api/transcript') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    return json(res, 200, gpaEngine.computeTranscript(student.id));
  }

  // ── برنامه هفتگی دانشجو
  if (route === '/api/my-schedule') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    const rows = db.prepare(`
      SELECT c.code, c.title, sch.dayOfWeek, sch.startTime, sch.endTime, sch.scheduleType, sch.examDate, r.name AS room, e.status
      FROM enrollments e
      JOIN course_offerings o ON o.id = e.offeringId
      JOIN courses c ON c.id = o.courseId
      JOIN schedules sch ON sch.offeringId = o.id
      LEFT JOIN classrooms r ON r.id = sch.roomId
      WHERE e.studentId = ? AND e.status IN ('REGISTERED','PENDING_COUNCIL')
      ORDER BY sch.dayOfWeek, sch.startTime`).all(student.id);
    return json(res, 200, rows);
  }

  // ── درخواست‌های من (دانشجو)
  if (route === '/api/my-requests') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    const rows = db.prepare(`
      SELECT r.id, r.trackingCode, r.status, r.createdAt, r.formData, r.updatedAt,
             pd.title AS processTitle, ps.title AS stepTitle,
             (SELECT GROUP_CONCAT(l2.action || ' (' || COALESCE(u2.firstName,'سیستم') || ')', ' ← ')
              FROM request_step_logs l2 LEFT JOIN staff s2 ON s2.id = l2.actorStaffId LEFT JOIN users u2 ON u2.id = s2.userId
              WHERE l2.requestId = r.id AND l2.completedAt IS NOT NULL) AS history
      FROM student_requests r
      JOIN process_definitions pd ON pd.id = r.processId
      LEFT JOIN process_steps ps ON ps.id = r.currentStepId
      WHERE r.studentId = ? ORDER BY r.createdAt DESC`).all(student.id);
    return json(res, 200, rows.map(r => ({ ...r, formData: JSON.parse(r.formData || '{}') })));
  }

  // ── اعلامیه‌های من
  if (route === '/api/notifications') {
    const rows = db.prepare(`SELECT * FROM notifications WHERE userId = ? ORDER BY id DESC LIMIT 30`).all(user.id);
    return json(res, 200, rows.map(n => ({ ...n, payload: JSON.parse(n.payload || '{}') })));
  }

  // ── کارتابل گردش کار (کارکنان)
  if (route === '/api/workflow/inbox') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'کارتابل فقط برای کارکنان.' });
    const roles = rbac.getRoles(user.id).map(r => r.code);
    let items = [];
    for (const rc of roles) items.push(...workflow.getInbox({ roleCode: rc, staffId: staff.id }));
    const uniq = new Map(); for (const i of items) uniq.set(i.id, i);
    return json(res, 200, [...uniq.values()]);
  }

  if (route === '/api/workflow/act' && url.method === 'POST') {
    if (!rbac.hasPermission(user.id, 'workflow.act')) return json(res, 403, { error: 'دسترسی ندارید.' });
    const staff = getStaff(user.id);
    try {
      const r = workflow.actOnRequest(body.requestId, staff ? staff.id : null, body.action, body.note || '');
      rbac.audit({ actorUserId: user.id, action: `WORKFLOW_${body.action}`, entityType: 'request', entityId: body.requestId, details: { note: body.note } });
      return json(res, 200, r);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── درخواست مجوز کمیسیون (دانشجو مسدود)
  if (route === '/api/requests/commission' && url.method === 'POST') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    try {
      const r = workflow.submitRequest(student.id, 'COMMISSION_PERMIT', {
        reason: body.reason || 'اتمام سنوات / مشروطی بیش از حد',
        sajadCode: body.sajadCode || '', extraSemesters: Number(body.extraSemesters || 1)
      });
      return json(res, 200, r);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── مدیریت: آیین‌نامه‌ها
  if (route === '/api/admin/regulations') {
    if (!rbac.hasPermission(user.id, 'admin.regulations') && !rbac.hasPermission(user.id, 'admin.all')) return json(res, 403, { error: 'دسترسی ندارید.' });
    const rows = db.prepare(`
      SELECT r.*, dl.title AS levelTitle,
        (SELECT COUNT(*) FROM students s WHERE s.regulationId = r.id) AS studentCount
      FROM educational_regulations r JOIN degree_level_configs dl ON dl.id = r.degreeLevelId`).all();
    return json(res, 200, rows.map(r => ({ ...r, rules: JSON.parse(r.rulesConfig) })));
  }

  // ── مدیریت: KPI و گلوگاه‌ها
  if (route === '/api/admin/kpi') {
    if (!rbac.hasPermission(user.id, 'admin.kpi') && !rbac.hasPermission(user.id, 'admin.all')) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, { kpi: workflow.getKpiReport(), bottlenecks: workflow.getBottlenecks() });
  }

  // ── مدیریت: اجرای دستی SLA Sweeper
  if (route === '/api/admin/sla-run' && url.method === 'POST') {
    if (!rbac.hasPermission(user.id, 'admin.all')) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, { applied: workflow.runSlaSweeper() });
  }

  // ── مدیریت: Audit Trail
  if (route === '/api/admin/audit') {
    if (!rbac.hasPermission(user.id, 'admin.all')) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, db.prepare(`SELECT a.*, (u.firstName || ' ' || u.lastName) AS actor FROM audit_logs a LEFT JOIN users u ON u.id = a.actorUserId ORDER BY a.id DESC LIMIT 100`).all());
  }

  // ── مالی من
  if (route === '/api/my-finance') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    const ledger = db.prepare(`
      SELECT l.*, t.title AS termTitle FROM student_ledger l
      LEFT JOIN academic_terms t ON t.id = l.termId WHERE l.studentId = ? ORDER BY l.id DESC`).all(student.id);
    const balance = db.prepare(`SELECT v.balance FROM v_student_balance v WHERE v.studentId = ?`).get(student.id);
    return json(res, 200, { ledger, balance: balance ? balance.balance : 0 });
  }

  // ═══ ماژول ۵: نمرات ═══

  // ── استاد: کلاس‌ها و کارنامه کلاس
  if (route === '/api/prof/offerings') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    return json(res, 200, grades.getProfessorOfferings(staff.id));
  }

  if (route === '/api/prof/roster') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, grades.getRoster(staff.id, Number(url.searchParams.get('offeringId')))); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/prof/grades/save' && url.method === 'POST') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try {
      const r = grades.saveDraft(staff.id, body.offeringId, body.grades || []);
      rbac.audit({ actorUserId: user.id, action: 'GRADES_DRAFT', entityType: 'offering', entityId: body.offeringId });
      return json(res, 200, r);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/prof/grades/temporary' && url.method === 'POST') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, grades.submitTemporary(staff.id, body.offeringId)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/prof/grades/otp' && url.method === 'POST') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, grades.requestFinalizeOtp(staff.id, body.offeringId, user.id)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/prof/grades/finalize' && url.method === 'POST') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, grades.finalizeWithOtp(staff.id, body.offeringId, body.code, user.id)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/prof/appeals') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    return json(res, 200, grades.getProfessorAppeals(staff.id));
  }

  if (route === '/api/prof/appeals/respond' && url.method === 'POST') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, grades.respondAppeal(staff.id, body.appealId, body.decision, body.reply, body.newGrade, user.id)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── دانشجو: نمرات ترم جاری + گیت ارزشیابی + اعتراض
  if (route === '/api/my-grades') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    return json(res, 200, grades.getMyGrades(student.id));
  }

  if (route === '/api/student/eval-form') {
    return json(res, 200, grades.getEvaluationForm(Number(url.searchParams.get('offeringId'))));
  }

  if (route === '/api/student/eval-submit' && url.method === 'POST') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    try { return json(res, 200, grades.submitEvaluation(student.id, body.offeringId, body.answers || [])); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/student/appeal' && url.method === 'POST') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    try {
      const r = grades.appealGrade(student.id, body.enrollmentId, body.message);
      rbac.audit({ actorUserId: user.id, action: 'GRADE_APPEAL', entityType: 'enrollment', entityId: body.enrollmentId });
      return json(res, 200, r);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }




  // ═══ ماژول ۷: فیش حقوقی و حق‌التدریس پویا ═══

  // ── استاد: داشبورد مالی من (ریز محاسبه شفاف — سند §۱۷۹۴)
  if (route === '/api/prof/payroll') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, payroll.getStaffPayslip(staff.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── اداره مالی/مدیر
  const finOffice = () => rbac.getRoles(user.id).some(r => ['FINANCE_EXPERT', 'ADMIN'].includes(r.code));
  if (route === '/api/admin/payroll/overview') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, payroll.getOverview());
  }
  if (route === '/api/admin/payroll/compute' && url.method === 'POST') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, payroll.computeTermPayroll(user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/payroll/midterm' && url.method === 'POST') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, payroll.payMidterm(Number(body.staffId), Number(body.percent || 40), user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/payroll/settle' && url.method === 'POST') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, payroll.settleFinal(Number(body.staffId), user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/payroll/export') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    const x = payroll.exportBatch();
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="afagh-payroll-batch.csv"' });
    return res.end('\uFEFF' + x.csv);
  }

  // ═══ بایگانی الکترونیک + ثبت‌نام غیرحضوری + e-KYC (سند §۲۴۱۵–۲۵۵۶) ═══

  // ── سرو فایل با گیت پوشه‌ای + لاگ واترمارک (§۲۴۷۸)
  if (route.startsWith('/api/files/') && url.method === 'GET') {
    try {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
      const f = archive.accessDocument(Number(route.split('/')[3]), user.id, ip);
      const data = require('fs').readFileSync(f.absPath);
      res.writeHead(200, { 'Content-Type': f.mime || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Watermark': encodeURIComponent(f.watermark) });
      return res.end(data);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── متقاضی (پورتال ویزارد)
  if (route === '/api/onboarding/me') {
    try { return json(res, 200, archive.getMyOnboarding(user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/onboarding/submit' && url.method === 'POST') {
    try { return json(res, 200, archive.submitProfile(user.id, body.profile || body)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/onboarding/upload' && url.method === 'POST') {
    try { return json(res, 200, archive.uploadDocument(user.id, body)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/onboarding/pay' && url.method === 'POST') {
    try { return json(res, 200, archive.payAdvanceGateway(user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/onboarding/kyc' && url.method === 'POST') {
    try { return json(res, 200, archive.runKyc(user.id, { simulate: body.simulate || 'ok', ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress, ua: req.headers['user-agent'] })); } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── کارشناس بایگانی / مدیر
  const archOffice = () => rbac.getRoles(user.id).some(r => ['ARCHIVE_EXPERT', 'ADMIN'].includes(r.code));
  if (route === '/api/admin/archive/import' && url.method === 'POST') {
    if (!archOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, archive.importSanjeshBatch(body.applicants || [], user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/archive/inbox') {
    if (!archOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, archive.getInbox());
  }
  if (route === '/api/admin/archive/doc-review' && url.method === 'POST') {
    if (!archOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, archive.reviewDocument(Number(body.docId), body.decision, body.note, user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/archive/kyc-review' && url.method === 'POST') {
    if (!archOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, archive.reviewKyc(Number(body.kycId), !!body.approve, user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/archive/approve' && url.method === 'POST') {
    if (!archOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, archive.reviewDossier(Number(body.stagingId), body.decision !== 'reject', body.note, user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/archive/dossier') {
    if (!rbac.getRoles(user.id).some(r => ['ARCHIVE_EXPERT', 'ADMIN', 'FINANCE_EXPERT', 'EDU_EXPERT'].includes(r.code)))
      return json(res, 403, { error: 'دسترسی ندارید.' });
    try {
      const q = (url.searchParams.get('q') || '').trim();
      const uid = q.length === 10
        ? (db.prepare(`SELECT id FROM users WHERE nationalCode = ?`).get(q) || {}).id
        : Number(url.searchParams.get('userId'));
      return json(res, 200, archive.getDossier(Number(uid), user.id));
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ═══ سامانه سخا (نظام وظیفه) — سه صندوق کارشناس (سند §۲۵۵۸–۲۷۴۰) ═══
  const milOffice = () => rbac.getRoles(user.id).some(r => ['MILITARY_OFFICER', 'ADMIN'].includes(r.code));
  if (route === '/api/admin/sakha/dashboard') {
    if (!milOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, sakha.getDashboard());
  }
  if (route === '/api/admin/sakha/approve-initial' && url.method === 'POST') {
    if (!milOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, sakha.approveInitial(Number(body.recordId), user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/sakha/send-extension' && url.method === 'POST') {
    if (!milOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, sakha.sendExtension(Number(body.recordId), user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/sakha/revoke' && url.method === 'POST') {
    if (!milOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, sakha.confirmRevocation(Number(body.recordId), user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/sakha/simulate-commission' && url.method === 'POST') {
    if (!milOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try {
      let sid = Number(body.studentId) || 0;
      if (!sid && body.studentCode) {
        const st = db.prepare(`SELECT id FROM students WHERE studentCode = ?`).get(String(body.studentCode).trim());
        if (!st) throw new Error('دانشجو یافت نشد.');
        sid = st.id;
      }
      return json(res, 200, sakha.onCommissionRuling(sid, Number(body.semesters) || 1));
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/sakha/simulate-payment' && url.method === 'POST') {
    if (!milOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    const cfg = db.prepare(`SELECT authCredentials FROM integrations_config WHERE serviceName='SAKHA_API' AND isActive=1`).get();
    const token = cfg ? JSON.parse(cfg.authCredentials || '{}').token : null;
    try {
      return json(res, 200, sakha.sakhaCallback({ token, studentCode: body.studentCode, event: 'PAID', newExpiryDate: body.newExpiryDate || null }));
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ═══ Micro-Offering: معرفی به استاد سه‌کلیکی (سند §۲۷۴۵–۲۷۷۵) ═══
  const eduAdmin = () => rbac.getRoles(user.id).some(r => ['EDU_EXPERT', 'ADMIN'].includes(r.code));
  if (route === '/api/admin/dr/check') {
    if (!eduAdmin()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, dr.checkEligibility(url.searchParams.get('studentCode'))); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/dr/list') {
    if (!eduAdmin()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, dr.listDirectedReadings());
  }
  if (route === '/api/admin/dr/create' && url.method === 'POST') {
    if (!eduAdmin()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, dr.createDirectedReading(body, user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ═══ موتور فرمول‌ساز مالی + ابلاغیهٔ تدریس (سند §۲۷۸۲–۲۸۶۰) ═══
  if (route === '/api/admin/payrules') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, { rules: payRules.listRules(), roleFa: payRules.ROLE_FA, typeFa: payRules.TYPE_FA });
  }
  if (route === '/api/admin/payrules/save' && url.method === 'POST') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, payRules.saveRule(body, user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/payrules/delete' && url.method === 'POST') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, payRules.deleteRule(Number(body.id), user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/payrules/estimate') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, payRules.estimateTerm(Number(url.searchParams.get('staffId')))); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/appointments/issue' && url.method === 'POST') {
    if (!finOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, payRules.issueAppointments(user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ═══ ماژول BI ارزشیابی (سند §۱۳۴۰–۱۳۶۵) ═══

  // ── استاد: پنل بازخورد اختصاصی (رادار/روند/ابر کلمات)
  if (route === '/api/prof/bi') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, bi.professorPanel(staff.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── مدیر گروه / معاون آموزشی / مدیر: گلوگاه کیفی + تحلیل امکانات
  const biOffice = () => rbac.getRoles(user.id).some(r => ['DEP_HEAD', 'VICE_EDU', 'ADMIN'].includes(r.code));
  if (route === '/api/admin/bi/overview') {
    if (!biOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, bi.managementOverview());
  }
  if (route === '/api/admin/bi/facilities') {
    if (!biOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, bi.facilitiesReport());
  }

  // ═══ ماژول ۱۰-الف: حضور و غیاب + قرارداد الکترونیکی ═══
  const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const simExt = (req, body) => !!body.simulateExternal || req.headers['x-sim-external'] === '1';

  // ── webhook سامانه سخا (نتیجهٔ پرداخت/رد تمدید — سند §۲۷۱۰)
  if (route === '/api/integrations/sakha/callback' && url.method === 'POST') {
    try { return json(res, 200, sakha.sakhaCallback(body)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── میان‌افزار دستگاه اثر انگشت گیت (Webhook سند §۱۹۶۷)
  if (route === '/api/integrations/fingerprint/punch' && url.method === 'POST') {
    try { return json(res, 200, att.ingestPunch({ token: req.headers['x-device-token'] || body.token, ...body })); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── استاد: جلسات کلاسی من
  if (route === '/api/prof/attendance/sessions') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    return json(res, 200, att.getMyClassSessions(staff.id));
  }

  // ── استاد: باز کردن لیست حضور و غیاب (گلوگاه قرارداد + حصار شبکه + بازه زمانی)
  if (route === '/api/prof/attendance/rollcall') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, att.openRollCall(staff.id, Number(url.searchParams.get('id')), { ip: clientIp(req), ua: req.headers['user-agent'], simulateExternal: simExt(req, {}) })); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/prof/attendance/submit' && url.method === 'POST') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, att.submitRollCall(staff.id, body.sessionId, body.attendance || [], { ip: clientIp(req), ua: req.headers['user-agent'], simulateExternal: simExt(req, body) }, user.id)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── استاد: قراردادها و ابلاغیه‌ها + امضای الکترونیکی OTP
  if (route === '/api/prof/documents') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    return json(res, 200, att.getMyDocuments(staff.id));
  }
  if (route === '/api/prof/documents/otp' && url.method === 'POST') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, att.requestDocOtp(staff.id, body.documentId)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/prof/documents/sign' && url.method === 'POST') {
    const staff = getStaff(user.id); if (!staff) return json(res, 403, { error: 'فقط استاد.' });
    try { return json(res, 200, att.signDocument(staff.id, body.documentId, body.code, { ip: clientIp(req), ua: req.headers['user-agent'] }, user.id)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── اداره آموزش/مدیر: گزارش، بازبینی، جبرانی، موتور تطبیق
  const attOffice = () => rbac.getRoles(user.id).some(r => ['EDU_EXPERT', 'VICE_EDU', 'ADMIN', 'DEP_HEAD'].includes(r.code));
  if (route === '/api/admin/attendance/report') {
    if (!attOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, { ...att.getAttendanceReport(), reviewQueue: att.getReviewQueue() });
  }
  if (route === '/api/admin/attendance/review-act' && url.method === 'POST') {
    if (!attOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, att.reviewSession(body, user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/attendance/makeup' && url.method === 'POST') {
    if (!attOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, att.createMakeUpSession(body, user.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (route === '/api/admin/attendance/correlate' && url.method === 'POST') {
    if (!attOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, { applied: att.runCorrelation() });
  }
  if (route === '/api/admin/attendance/generate-sessions' && url.method === 'POST') {
    if (!attOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, att.generateTermSessions(user.id));
  }
  if (route === '/api/admin/attendance/generate-contracts' && url.method === 'POST') {
    if (!attOffice()) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, att.generateContracts(user.id));
  }

  // ═══ ماژول ۶: مدیریت امتحانات و چیدمان صندلی ═══

  // ── دانشجو: کارت ورود به جلسه (سه‌گلوگاهی) + درخواست غیبت موجه
  if (route === '/api/my-exam-card') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    try { return json(res, 200, exams.getEntryCard(student.id)); } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/student/excuse' && url.method === 'POST') {
    const student = getStudent(user.id); if (!student) return json(res, 403, { error: 'فقط دانشجو.' });
    try {
      const r = exams.submitExcuse(student.id, body.enrollmentId, body.message, user.id);
      rbac.audit({ actorUserId: user.id, action: 'EXCUSE_SUBMITTED', entityType: 'enrollment', entityId: body.enrollmentId });
      return json(res, 200, r);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── اداره امتحانات (کارشناس آموزش/معاون/مدیر)
  const examOffice = ['EDU_EXPERT', 'VICE_EDU', 'ADMIN'];
  const isExamOffice = rbac.getRoles(user.id).some(r => examOffice.includes(r.code));

  if (route === '/api/admin/exams/sessions') {
    if (!isExamOffice) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, exams.getSessions());
  }

  if (route === '/api/admin/exams/session') {
    if (!isExamOffice) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, exams.getSessionDetail(Number(url.searchParams.get('id')))); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/admin/exams/generate' && url.method === 'POST') {
    if (!isExamOffice) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, exams.generateSeating({ strategy: body.strategy || 'ALTERNATING' }, user.id)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/admin/exams/absences' && url.method === 'POST') {
    if (!isExamOffice) return json(res, 403, { error: 'دسترسی ندارید.' });
    try { return json(res, 200, exams.markAbsences({ sessionId: body.sessionId, enrollmentIds: body.enrollmentIds || [] }, user.id)); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (route === '/api/admin/exams/invigilators' && url.method === 'POST') {
    if (!isExamOffice) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, exams.setInvigilator(body));
  }

  if (route === '/api/admin/exams/finalize-absences' && url.method === 'POST') {
    if (!isExamOffice) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, { applied: exams.finalizeExpiredAbsences() });
  }

  // ── مدیریت: اجرای SLA نمرات + تطبیق امضای نمرات قطعی
  if (route === '/api/admin/grade-sla-run' && url.method === 'POST') {
    if (!rbac.hasPermission(user.id, 'admin.all')) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, { applied: grades.runGradeSlaSweeper() });
  }

  if (route === '/api/admin/verify-grades') {
    if (!rbac.hasPermission(user.id, 'admin.all')) return json(res, 403, { error: 'دسترسی ندارید.' });
    return json(res, 200, grades.verifyGradesIntegrity());
  }

  return json(res, 404, { error: 'مسیر یافت نشد.' });
};

// ─── فایل‌های استاتیک (پنل) ───
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const serveStatic = (res, filePath) => {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // ── CORS برای کارکردن در iframe پیش‌نمایش (مبدأ null) — پنل توکن را در هدر می‌فرستد، کوکی نمی‌خواهد ──
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }
  try {
    if (url.pathname.startsWith('/api/')) reopenIfReplaced(); // اتصال خودکار به DB تازه پس از reset
    if (url.pathname.startsWith('/api/')) return await api(req, res, { pathname: url.pathname, method: req.method, searchParams: url.searchParams });
    if (url.pathname === '/' || url.pathname === '/index.html') return serveStatic(res, path.join(__dirname, '..', 'public', 'index.html'));
    if (url.pathname === '/health') { res.writeHead(200); return res.end('OK'); }
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error('❌', e);
    json(res, 500, { error: 'خطای داخلی سرور' });
  }
});

server.listen(PORT, HOST, () => {
  console.log('═══════════════════════════════════════════════');
  console.log('  🎓 سامانه جامع آموزشی دانشگاه آفاق — فاز صفر');
  console.log(`  ▶ در حال اجرا:  http://${HOST}:${PORT}`);
  console.log('═══════════════════════════════════════════════');
});
