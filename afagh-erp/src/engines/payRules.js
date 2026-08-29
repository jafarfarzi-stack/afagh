'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  موتور فرمول‌ساز مالی + ابلاغیهٔ یکپارچهٔ تدریس — سند §۲۷۸۲–۲۸۶۰
 *
 *  ۱) قوانین جبران خدمات (payroll_calculation_rules) کاملاً داده‌محور:
 *     متغیرها: {نرخ_پایه} × {تعداد_واحد} × {تعداد_دانشجو} × ضریب نقش/نوع درس
 *       • ضریب واحد (multiplierUnit)   → نرخ × واحد × ضریب
 *       • ضریب دانشجو (multiplierPerStudent) → نرخ × واحد × دانشجو × ضریب
 *       • مقطوع (flatFee)              → مبلغ ثابت × تعداد دانشجو (هر جلسه دفاع)
 *     تطبیق قاعده: خاص‌ترین (نوع ارائه + نقش + مرتبه) برنده — هیچ چیزی هاردکد نیست
 *
 *  ۲) ابلاغیهٔ تدریس الکترونیک (سه بخش — سند §۲۸۳۰):
 *     بخش ۱: دروس دارای برنامهٔ هفتگی | بخش ۲: فعالیت‌های پژوهشی بدون زمان ثابت
 *     بخش ۳: برآورد ریالی حق‌التدریس ترم (پیش از کسر مالیات) — سپس امضای OTP
 * ══════════════════════════════════════════════════════════════════════
 */
const crypto = require('crypto');
const { db, tx } = require('../db');
const rbac = require('./rbac');

const sha = t => crypto.createHash('sha256').update(t).digest('hex');

const ROLE_FA = { MAIN_LECTURER: 'مدرس اصلی', SUPERVISOR: 'استاد راهنما', ADVISOR: 'استاد مشاور', REVIEWER: 'داور', EXAMINER: 'ممتحن' };
const TYPE_FA = { THEORY: 'نظری', THESIS: 'پایان‌نامه', DIRECTED_READING: 'معرفی به استاد', INTERNSHIP: 'کارآموزی' };
const DAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

function notify(userId, eventCode, vars = {}, explicitText = null) {
  if (!userId) return;
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`)
    .run(userId, eventCode, JSON.stringify({ text: explicitText || `[${eventCode}]`, vars }));
}

/* ─── CRUD قوانین (پنل مدیر مالی — سند §۲۸۴۷) ─── */
function listRules() {
  return db.prepare(`SELECT * FROM payroll_calculation_rules WHERE isActive = 1 ORDER BY offeringType, professorRole, academicRank`).all()
    .map(r => ({
      ...r,
      multiplierUnit: r.multiplierUnit == null ? null : Number(r.multiplierUnit),
      multiplierPerStudent: r.multiplierPerStudent == null ? null : Number(r.multiplierPerStudent),
      flatFee: r.flatFee == null ? null : Number(r.flatFee),
    }));
}

function saveRule(b, actorUserId) {
  const type = b.offeringType || null, role = b.professorRole || null, rank = b.academicRank || null;
  if (!type && !role) throw new Error('فرمول باید اختصاصی باشد: نوع ارائه یا نقش استاد را مشخص کنید (قواعد عمومی مسیر ضرایب استاندارد را دارا هستند).');
  const unit = b.multiplierUnit == null || b.multiplierUnit === '' ? null : Number(b.multiplierUnit);
  const perSt = b.multiplierPerStudent == null || b.multiplierPerStudent === '' ? null : Number(b.multiplierPerStudent);
  const flat = b.flatFee == null || b.flatFee === '' ? null : Number(b.flatFee);
  if (unit == null && perSt == null && flat == null) throw new Error('حداقل یکی از ضرایب (واحد / دانشجو / مقطوع) را وارد کنید.');
  for (const v of [unit, perSt]) if (v != null && (v < 0 || v > 10)) throw new Error('ضریب در بازهٔ معتبر (۰ تا ۱۰) نیست.');
  if (flat != null && flat < 0) throw new Error('مبلغ مقطوع نامعتبر است.');
  return tx(() => {
    if (b.id) {
      db.prepare(`UPDATE payroll_calculation_rules SET offeringType=?, professorRole=?, academicRank=?, multiplierUnit=?, multiplierPerStudent=?, flatFee=?, title=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?`)
        .run(type, role, rank, unit, perSt, flat, b.title || null, b.id);
    } else {
      db.prepare(`INSERT INTO payroll_calculation_rules (offeringType, professorRole, academicRank, multiplierUnit, multiplierPerStudent, flatFee, title) VALUES (?,?,?,?,?,?,?)`)
        .run(type, role, rank, unit, perSt, flat, b.title || null);
    }
    rbac.audit({ actorUserId, action: 'PAYRULE_SAVED', entityType: 'payroll_rule', entityId: b.id || null, details: { type, role, rank, unit, perSt, flat } });
    return { ok: true };
  });
}

function deleteRule(id, actorUserId) {
  const r = db.prepare(`UPDATE payroll_calculation_rules SET isActive = 0 WHERE id=?`).run(id);
  if (!r.changes) throw new Error('قانون یافت نشد.');
  rbac.audit({ actorUserId, action: 'PAYRULE_DELETED', entityType: 'payroll_rule', entityId: id });
  return { ok: true };
}

/* ─── تطبیق قاعده: خاص‌ترین برنده (سند §۲۸۴۷) ─── */
function matchRule(offeringType, professorRole, academicRank) {
  const t = offeringType === 'NORMAL' ? 'THEORY' : offeringType; // کلاس عادی = نظری
  return db.prepare(`
    SELECT * FROM payroll_calculation_rules
    WHERE isActive = 1
      AND (offeringType IS NULL OR offeringType = ?)
      AND (professorRole IS NULL OR professorRole = ?)
      AND (academicRank IS NULL OR academicRank = ?)
      AND (offeringType IS NOT NULL OR professorRole IS NOT NULL)   -- قاعده باید اختصاصی باشد
    ORDER BY (offeringType IS NOT NULL) + (professorRole IS NOT NULL) + (academicRank IS NOT NULL) DESC, id
    LIMIT 1`).get(t, professorRole, academicRank || null) || null;
}

/** ارزیابی فرمول — { نرخ_پایه، تعداد_واحد، تعداد_دانشجو } */
function ruleAmount(rule, rate, units, students) {
  const st = Math.max(Number(students) || 0, 0);
  if (rule.flatFee != null) {
    const rial = Math.round(Number(rule.flatFee) * Math.max(st, 1)); // مقطوع به‌ازای هر جلسه (هر دانشجو)
    return { rial, unitEquiv: rial / rate, formula: `مقطوع ${Number(rule.flatFee).toLocaleString('fa-IR')} × ${st || 1} جلسه` };
  }
  if (rule.multiplierPerStudent != null) {
    const m = Number(rule.multiplierPerStudent);
    const rial = Math.round(rate * units * st * m);
    return { rial, unitEquiv: rial / rate, formula: `نرخ × ${units} واحد × ${st} دانشجو × ${m}` };
  }
  const m = Number(rule.multiplierUnit == null ? 1 : rule.multiplierUnit);
  const rial = Math.round(rate * units * m);
  return { rial, unitEquiv: rial / rate, formula: `نرخ × ${units} واحد × ${m}` };
}

/* ─── فعالت‌های ترم استاد (با نقش هر کلاس — سند §۲۸۰۷) ─── */
function getStaffActivities(staffId, termId) {
  const rank = db.prepare(`SELECT academicRank FROM staff WHERE id=?`).get(staffId).academicRank;
  return db.prepare(`
    SELECT o.id, o.offeringType, c.code, c.title, c.units, c.practicalUnits, o.groupNumber,
           o.customGradeDeadline,
           (SELECT COUNT(*) FROM enrollments e WHERE e.offeringId = o.id AND e.status = 'REGISTERED') AS students,
           CASE WHEN op.id IS NOT NULL THEN op.role
                WHEN o.professorId = ? AND o.offeringType = 'THESIS' THEN 'SUPERVISOR'
                WHEN o.professorId = ? THEN 'MAIN_LECTURER' END AS role,
           CASE WHEN op.id IS NULL THEN 100 ELSE op.sharePercentage END AS sharePct,
           (o.professorId = ?) AS isMain
    FROM course_offerings o
    JOIN courses c ON c.id = o.courseId
    LEFT JOIN offering_professors op ON op.offeringId = o.id AND op.staffId = ?
    WHERE o.termId = ? AND o.isActive = 1 AND (o.professorId = ? OR op.id IS NOT NULL)
    ORDER BY c.code`).all(staffId, staffId, staffId, staffId, termId, staffId).map(r => ({ ...r, rank }));
}

/* ─── برآورد حق‌التدریس ترم (پیش از کسر مالیات — سند §۲۸۴۷ بخش ۳) ─── */
function estimateTerm(staffId, termId) {
  const term = termId ? db.prepare(`SELECT * FROM academic_terms WHERE id=?`).get(termId)
    : db.prepare(`SELECT * FROM academic_terms WHERE isCurrent=1`).get();
  const staff = db.prepare(`SELECT s.*, u.firstName || ' ' || u.lastName AS name FROM staff s JOIN users u ON u.id=s.userId WHERE s.id=?`).get(staffId);
  if (!staff) throw new Error('استاد یافت نشد.');
  const rate = db.prepare(`
    SELECT baseRatePerUnit FROM teaching_rates
    WHERE academicRank = ? AND degree = ? AND effectiveYear <= 2025
    ORDER BY effectiveYear DESC LIMIT 1`).get(staff.academicRank, staff.degree);
  if (!rate) throw new Error('نرخ پایه برای این مرتبه/مدرک ثبت نشده است.');
  const baseRate = Number(rate.baseRatePerUnit);

  const rows = [], regular = [], special = [];
  for (const a of getStaffActivities(staffId, term.id)) {
    const rule = matchRule(a.offeringType, a.role, a.rank);
    if (rule) {
      const x = ruleAmount(rule, baseRate, Number(a.units), a.students);
      special.push(a);
      rows.push({
        offeringId: a.id, code: a.code, title: a.title, type: TYPE_FA[a.offeringType === 'NORMAL' ? 'THEORY' : a.offeringType] || a.offeringType,
        role: ROLE_FA[a.role] || a.role, units: Number(a.units), students: a.students,
        formula: x.formula, ruleTitle: rule.title, amount: x.rial, unitEquiv: +x.unitEquiv.toFixed(2), isRule: true,
      });
    } else regular.push(a);
  }
  return { staff: { id: staffId, name: staff.name, rank: staff.academicRank }, term: term.title, baseRate, rows, regularCount: regular.length,
    total: rows.reduce((s, r) => s + r.amount, 0),
    note: 'برآورد پیش از کسر مالیات و کسورات — دروس با فرمول اختصاصی؛ دروس نظری/عملی عادی طبق ضرایب استاندارد در فیش محاسبه می‌شوند.' };
}

/* ─── ابلاغیهٔ تدریس یکپارچه (سه بخش + امضای الکترونیک — سند §۲۸۳۰) ─── */
function issueAppointments(actorUserId) {
  return tx(() => {
    const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent=1`).get();
    const staffIds = db.prepare(`
      SELECT DISTINCT s.id FROM staff s
      WHERE EXISTS (SELECT 1 FROM course_offerings o WHERE o.termId = ? AND (o.professorId = s.id OR EXISTS (SELECT 1 FROM offering_professors op WHERE op.offeringId = o.id AND op.staffId = s.id)))`)
      .all(term.id).map(r => r.id);
    let issued = 0;
    for (const id of staffIds) {
      if (db.prepare(`SELECT 1 FROM electronic_documents WHERE staffId=? AND termId=? AND docType='APPOINTMENT'`).get(id, term.id)) continue;
      const staff = db.prepare(`SELECT u.firstName || ' ' || u.lastName AS name, s.userId AS userId FROM staff s JOIN users u ON u.id=s.userId WHERE s.id=?`).get(id);
      const acts = getStaffActivities(id, term.id);
      const sched = db.prepare(`
        SELECT c.title, c.units, c.code, s.dayOfWeek, s.startTime, s.endTime, cr.name AS room, cr.buildingName
        FROM schedules s
        JOIN course_offerings o ON o.id = s.offeringId
        JOIN courses c ON c.id = o.courseId
        LEFT JOIN classrooms cr ON cr.id = s.roomId
        WHERE s.scheduleType = 'CLASS' AND o.termId = ? AND (o.professorId = ? OR EXISTS (SELECT 1 FROM offering_professors op WHERE op.offeringId = o.id AND op.staffId = ?))
        ORDER BY s.dayOfWeek, s.startTime`).all(term.id, id, id);

      const sec1 = sched.length
        ? sched.map(x => `• ${DAYS_FA[x.dayOfWeek] || '—'}‌ها ${String(x.startTime).slice(0,5)} تا ${String(x.endTime).slice(0,5)} | ${x.buildingName ? x.buildingName + ' – ' : ''}${x.room || '—'} | ${x.title} (${Number(x.units)} واحد)`).join('\n')
        : '— موردی ثبت نشده است.';
      const noFixed = acts.filter(a => a.offeringType !== 'NORMAL');
      const sec2 = noFixed.length
        ? noFixed.map(a => {
            if (a.students) return `• ${a.title}${a.offeringType === 'THESIS' ? '' : ` (${a.students} دانشجو)`} | نقش: ${ROLE_FA[a.role] || a.role} | (${Number(a.units)} واحد)`;
            return `• ${a.title} | نقش: ${ROLE_FA[a.role] || a.role}`;
          }).join('\n')
        : '— موردی ثبت نشده است.';

      let est = null;
      try { est = estimateTerm(id, term.id); } catch { /* استاد بدون نرخ — برآورد خالی */ }
      const sec3 = est && est.rows.length
        ? est.rows.map(r => `• ${r.title} (${r.type} — ${r.role}): ${r.formula} = ${r.amount.toLocaleString('fa-IR')} ریال`).join('\n') +
          `\nجمع برآورد فعالیت‌های فرمولی: ${est.total.toLocaleString('fa-IR')} ریال` +
          (est.regularCount ? `\n(${est.regularCount} درس عادی نیز طبق ضرایب استاندارد و نرخ ${est.baseRate.toLocaleString('fa-IR')} ریال محاسبه می‌شود.)` : '')
        : '— دروس این استاد طبق ضرایب استاندارد محاسبه می‌شود.';

      const snap = `ابلاغیه تدریس — ${term.title}\nاستاد گرامی ${staff.name}\n`
        + `\nبخش ۱ — دروس دارای برنامهٔ هفتگی:\n${sec1}\n`
        + `\nبخش ۲ — فعالیت‌های پژوهشی و بدون زمان ثابت:\n${sec2}\n`
        + `\nبخش ۳ — برآورد حق‌التدریس ترم (پیش از کسر مالیات):\n${sec3}\n`
        + `\nاین ابلاغیه به‌صورت الکترونیکی و با کد تایید پیامکی امضا می‌شود و دارای اعتبار قانونی و غیرقابل انکار (Non-repudiation) است.`;
      db.prepare(`INSERT INTO electronic_documents (staffId, termId, docType, title, documentSnapshot, documentHash) VALUES (?,?,?,?,?,?)`)
        .run(id, term.id, 'APPOINTMENT', `ابلاغیه تدریس — ${term.title}`, snap, sha(snap));
      notify(staff.userId, 'DOC_ISSUED', { title: 'ابلاغیه تدریس' },
        `استاد گرامی، ابلاغیه تدریس ${term.title} (برنامهٔ هفتگی + برآورد حق‌التدریس) در کارتابل شما قرار گرفت. جهت امضای الکترونیکی مراجعه فرمایید.`);
      issued++;
    }
    rbac.audit({ actorUserId, action: 'APPOINTMENTS_ISSUED', entityType: 'term', entityId: term.id, details: { issued } });
    return { issued };
  });
}

module.exports = { listRules, saveRule, deleteRule, matchRule, ruleAmount, estimateTerm, issueAppointments, getStaffActivities, ROLE_FA, TYPE_FA };
