'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  ماژول ۷ — قراردادها و حق‌التدریس اساتید (Faculty Payroll) — سند §۱۷۱۵–۱۸۰۰
 *
 *  موتور محاسبه‌گر (Payroll Calculator Engine) — کاملاً داده‌محور:
 *    گام ۱ — واحد معادل: واحد درس × ضرایب پویا از teaching_coefficients
 *            (درس عملی / مقطع ارشد / کلاس جمعی >۴۰ نفر) × سهم استاد (offering_professors)
 *    گام ۲ — کسر موظفی: هیئت علمی baseDutyUnits ترمیک؛ مدعو از واحد اول قابل پرداخت
 *    گام ۳ — کسورات: جلسات برگزارنشده بدون جبران (از ماژول حضور و غیاب) به‌تناسب
 *            واحد کسر + «کسورات عدم برگزاری کلاس» در ریز فیش + مالیات (taxRate قرارداد)
 *
 *  گردش پرداخت (اهرم فشار سند §۱۷۸۳):
 *    DRAFT → MID_TERM_PAID (علی‌الحساب ۴۰٪ — مدعوها) → FINAL_SETTLED
 *    گلوگاه تسویه: ① همهٔ نمرات استاد FINALIZED شده باشد
 *                 ② همهٔ اسناد الکترونیکی او امضاشده باشد (سند §۱۸۸۷)
 * ══════════════════════════════════════════════════════════════════════
 */
const { db, tx } = require('../db');
const rbac = require('./rbac');
const payRules = require('./payRules');

const TERM_PLANNED_SESSIONS = 16; // پایه برنامه ترم (قابل تفکیک در فاز بعد بر اساس هفته‌ها)

function notify(userId, eventCode, vars = {}, explicitText = null) {
  if (!userId) return;
  const tpl = db.prepare(`SELECT * FROM notification_templates WHERE eventCode = ? AND isActive = 1`).get(eventCode);
  let text = explicitText || `[${eventCode}]`;
  if (tpl) text = tpl.templateText.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `«${k}»`);
  db.prepare(`INSERT INTO notifications (userId, eventCode, payload) VALUES (?,?,?)`).run(userId, eventCode, JSON.stringify({ text, vars }));
}

/** ضرایب پویا از دیتابیس (ruleName → multiplier) */
function loadCoefficients() {
  const map = {};
  for (const r of db.prepare(`SELECT ruleName, multiplier FROM teaching_coefficients`).all())
    map[r.ruleName] = Number(r.multiplier);
  return {
    practical: map['ضریب درس عملی'] ?? 1.5,
    msLevel: map['ضریب مقطع ارشد'] ?? 1.2,
    crowded: map['ضریب کلاس جمعی (>۴۰ نفر)'] ?? 1.15,
  };
}

/** نرخ پایه بر اساس رتبه/مدرک استاد (بیشترین سال اعتبار ≤ ۱۴۰۵) */
function getBaseRate(staff) {
  const row = db.prepare(`
    SELECT baseRatePerUnit FROM teaching_rates
    WHERE academicRank = ? AND degree = ? AND effectiveYear <= 1405
    ORDER BY effectiveYear DESC LIMIT 1`).get(staff.academicRank, staff.degree);
  return Number(row?.baseRatePerUnit || 0);
}

const getStaff = staffId => db.prepare(`
  SELECT st.*, u.firstName, u.lastName, u.id AS userId FROM staff st JOIN users u ON u.id = st.userId WHERE st.id = ?`).get(staffId);

/** همهٔ کلاس‌های استاد در ترم (اصلی + همکار با سهم درصدی) */
function getTermOfferings(staffId, termId) {
  return db.prepare(`
    SELECT o.id, c.code, c.title, c.units, c.practicalUnits, o.groupNumber, o.enrolledCount, c.code AS courseCode,
           o.offeringType,
           CASE WHEN op.id IS NOT NULL THEN op.role
                WHEN o.professorId = ? AND o.offeringType = 'THESIS' THEN 'SUPERVISOR'
                ELSE 'MAIN_LECTURER' END AS payRole,
           CASE WHEN op.id IS NULL THEN 100 ELSE op.sharePercentage END AS sharePct,
           (o.professorId = ?) AS isMain
    FROM course_offerings o
    JOIN courses c ON c.id = o.courseId
    LEFT JOIN offering_professors op ON op.offeringId = o.id AND op.staffId = ?
    WHERE o.termId = ? AND o.isActive = 1 AND (o.professorId = ? OR op.id IS NOT NULL)`).all(staffId, staffId, staffId, termId, staffId);
}

/** آمار جلسات یک کلاس (از ماژول حضور و غیاب) */
function sessionStats(offeringId) {
  const r = db.prepare(`
    SELECT
      SUM(CASE WHEN cs.isMakeUpSession = 0 THEN 1 ELSE 0 END) AS planned,
      SUM(CASE WHEN cs.status = 'HELD' AND cs.isMakeUpSession = 0 THEN 1 ELSE 0 END) AS held,
      SUM(CASE WHEN cs.status = 'ABSENT' THEN 1 ELSE 0 END) AS absents,
      SUM(CASE WHEN cs.status = 'HELD' AND cs.isMakeUpSession = 1 THEN 1 ELSE 0 END) AS makeup
    FROM class_sessions cs WHERE cs.offeringId = ?`).get(offeringId);
  return {
    planned: r.planned || 0, held: r.held || 0, absents: r.absents || 0, makeup: r.makeup || 0,
    netAbsences: Math.max(0, (r.absents || 0) - (r.makeup || 0)),
  };
}

/** گلوگاه‌های تسویه: نمرات قطعی + اسناد امضاشده */
function getGates(staffId, termId) {
  const pendingGrades = db.prepare(`
    SELECT COUNT(*) AS c FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId
    WHERE o.termId = ? AND e.status = 'REGISTERED' AND e.gradeStatus != 'FINALIZED'
      AND (o.professorId = ? OR EXISTS (SELECT 1 FROM offering_professors op WHERE op.offeringId = o.id AND op.staffId = ?))`)
    .get(termId, staffId, staffId).c;
  const unsignedDocs = db.prepare(`
    SELECT COUNT(*) AS c FROM electronic_documents
    WHERE staffId = ? AND termId = ? AND signatureStatus != 'SIGNED'`).get(staffId, termId).c;
  return { gradesFinalized: pendingGrades === 0, pendingGrades, docsSigned: unsignedDocs === 0, unsignedDocs };
}

/** محاسبهٔ کامل فیش یک استاد (بدون درج) — برای نمایش شفاف */
function calcStaffPayroll(staffId, termId) {
  const staff = getStaff(staffId);
  if (!staff) throw new Error('استاد یافت نشد.');
  const contract = db.prepare(`SELECT * FROM professor_term_contracts WHERE staffId = ? AND termId = ?`).get(staffId, termId);
  if (!contract) throw new Error('قرارداد ترمی برای این استاد ثبت نشده است.');
  const coefs = loadCoefficients();
  const rate = getBaseRate(staff);
  const dutyUnits = Number(contract.baseDutyUnits || 0);
  const taxRate = Number(contract.taxRate || 0);

  const offerings = getTermOfferings(staffId, termId);
  const rows = [];
  let totalEquiv = 0, absenceDeductionRial = 0;
  for (const o of offerings) {
    // موتور فرمول‌ساز (سند §۲۷۸۴): نوع ارائه/نقش دارای قانون اختصاصی ← فرمول جایگزین ضرایب و سهم
    const rule = payRules.matchRule(o.offeringType, o.payRole, staff.academicRank);
    if (rule) {
      const x = payRules.ruleAmount(rule, rate, Number(o.units), o.enrolledCount);
      totalEquiv += x.unitEquiv;
      rows.push({
        offeringId: o.id, code: o.code, title: o.title, units: Number(o.units), group: o.groupNumber,
        coefficients: `فرمول ${payRules.TYPE_FA[o.offeringType === 'NORMAL' ? 'THEORY' : o.offeringType] || o.offeringType}/${payRules.ROLE_FA[o.payRole] || o.payRole}: ${x.formula}`,
        equivalentUnits: +x.unitEquiv.toFixed(2),
        sessions: { planned: 0, held: 0, absents: 0, makeup: 0, netAbsences: 0 },
        effectiveUnits: +x.unitEquiv.toFixed(2), absenceDeductionRial: 0,
      });
      continue;
    }
    const applied = [];
    let mult = 1;
    if (Number(o.practicalUnits) > 0) { mult *= coefs.practical; applied.push(`عملی ×${coefs.practical}`); }
    if (o.courseCode.startsWith('21')) { mult *= coefs.msLevel; applied.push(`ارشد ×${coefs.msLevel}`); }
    if (o.enrolledCount > 40) { mult *= coefs.crowded; applied.push(`جمعی ×${coefs.crowded}`); }
    const share = Number(o.sharePct) / 100;
    if (share < 1) applied.push(`سهم ${Math.round(share * 100)}٪`);
    const equiv = Number(o.units) * mult * share;
    const st = sessionStats(o.id);
    const planned = st.planned || TERM_PLANNED_SESSIONS;
    const effEquiv = equiv * (planned - st.netAbsences) / planned;
    const dedRial = Math.round((equiv * st.netAbsences / planned) * rate);
    totalEquiv += equiv;
    absenceDeductionRial += dedRial;
    rows.push({
      offeringId: o.id, code: o.code, title: o.title, units: Number(o.units), group: o.groupNumber,
      coefficients: applied.length ? applied.join('، ') : '—', equivalentUnits: +equiv.toFixed(2),
      sessions: st, effectiveUnits: +effEquiv.toFixed(2), absenceDeductionRial: dedRial,
    });
  }

  const totalEffective = rows.reduce((a, r) => a + r.effectiveUnits, 0);
  const payableUnits = Math.max(0, +(totalEffective - dutyUnits).toFixed(2));
  const gross = Math.round(payableUnits * rate);
  const tax = Math.round(gross * taxRate / 100);
  const net = gross - tax;
  return {
    staff: { id: staffId, name: `${staff.firstName} ${staff.lastName}`, rank: staff.academicRank, degree: staff.degree, contractType: contract.contractType },
    rate, dutyUnits, taxRate, rows,
    totalEquivalentUnits: +totalEquiv.toFixed(2),
    totalEffectiveUnits: +totalEffective.toFixed(2),
    payableUnits, gross, absenceDeductionRial, tax, net,
    gates: getGates(staffId, termId),
  };
}

/** محاسبهٔ فیش کل ترم (کارشناس مالی) — upsert با حفظ وضعیت پرداخت */
function computeTermPayroll(actorUserId) {
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
  const staffIds = db.prepare(`
    SELECT DISTINCT o.professorId AS id FROM course_offerings o
    WHERE o.termId = ? AND o.professorId IS NOT NULL
      AND EXISTS (SELECT 1 FROM professor_term_contracts c WHERE c.staffId = o.professorId AND c.termId = ?)`).all(term.id, term.id).map(r => r.id);
  let computed = 0;
  for (const id of staffIds) {
    const calc = calcStaffPayroll(id, term.id);
    tx(() => {
      const existing = db.prepare(`
        SELECT ps.* FROM payroll_statements ps
        JOIN professor_term_contracts c ON c.id = ps.contractId
        WHERE c.staffId = ? AND c.termId = ?`).get(id, term.id);
      const detail = JSON.stringify({
        rows: calc.rows, rate: calc.rate, dutyUnits: calc.dutyUnits, taxRate: calc.taxRate,
        absenceDeductionRial: calc.absenceDeductionRial, staff: calc.staff, gates: calc.gates,
      });
      if (existing && existing.status !== 'FINAL_SETTLED') {
        db.prepare(`UPDATE payroll_statements SET totalEquivalentUnits=?, payableUnits=?, grossAmount=?, deductions=?, netAmount=?, detailJson=?, computedAt=CURRENT_TIMESTAMP WHERE id=?`)
          .run(calc.totalEquivalentUnits, calc.payableUnits, calc.gross, calc.tax + calc.absenceDeductionRial, calc.net, detail, existing.id);
      } else if (!existing) {
        const cid = db.prepare(`SELECT id FROM professor_term_contracts WHERE staffId=? AND termId=?`).get(id, term.id).id;
        db.prepare(`INSERT INTO payroll_statements (contractId, totalEquivalentUnits, payableUnits, grossAmount, deductions, netAmount, detailJson) VALUES (?,?,?,?,?,?,?)`)
          .run(cid, calc.totalEquivalentUnits, calc.payableUnits, calc.gross, calc.tax + calc.absenceDeductionRial, calc.net, detail);
      }
      computed++;
    });
  }
  rbac.audit({ actorUserId, action: 'PAYROLL_COMPUTED', entityType: 'term', entityId: term.id, details: { computed } });
  return { ok: true, computed };
}

/** فیش جاری استاد (از DB؛ اگر نبود، محاسبهٔ زنده بدون درج) */
function getStaffPayslip(staffId) {
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
  const ps = db.prepare(`
    SELECT ps.* FROM payroll_statements ps
    JOIN professor_term_contracts c ON c.id = ps.contractId
    WHERE c.staffId = ? AND c.termId = ?`).get(staffId, term.id);
  const calc = calcStaffPayroll(staffId, term.id);
  if (!ps) return { computed: false, term: term.title, calc, statement: null };
  return {
    computed: true, term: term.title, calc,
    statement: {
      status: ps.status, midtermPaidAmount: Number(ps.midtermPaidAmount || 0), midtermPaidAt: ps.midtermPaidAt,
      finalPaidAmount: Number(ps.finalPaidAmount || 0), finalPaidAt: ps.finalPaidAt,
      remaining: Math.max(0, calc.net - Number(ps.midtermPaidAmount || 0) - Number(ps.finalPaidAmount || 0)),
    },
  };
}

/** داشبورد مالی — بودجهٔ ترم و وضعیت گلوگاه‌ها */
function getOverview() {
  const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
  const staffIds = db.prepare(`
    SELECT DISTINCT o.professorId AS id FROM course_offerings o
    WHERE o.termId = ? AND o.professorId IS NOT NULL`).all(term.id).map(r => r.id);
  const list = [];
  for (const id of staffIds) {
    try {
      const calc = calcStaffPayroll(id, term.id);
      const ps = db.prepare(`SELECT ps.* FROM payroll_statements ps JOIN professor_term_contracts c ON c.id = ps.contractId WHERE c.staffId=? AND c.termId=?`).get(id, term.id);
      list.push({
        staffId: id, name: calc.staff.name, rank: calc.staff.rank, contractType: calc.staff.contractType,
        totalEquivalentUnits: calc.totalEquivalentUnits, payableUnits: calc.payableUnits,
        gross: calc.gross, tax: calc.tax, absenceDeduction: calc.absenceDeductionRial, net: calc.net,
        status: ps ? ps.status : 'NOT_COMPUTED',
        midtermPaid: ps ? Number(ps.midtermPaidAmount || 0) : 0,
        finalPaid: ps ? Number(ps.finalPaidAmount || 0) : 0,
        remaining: ps ? Math.max(0, calc.net - Number(ps.midtermPaidAmount || 0) - Number(ps.finalPaidAmount || 0)) : calc.net,
        gates: calc.gates,
      });
    } catch { /* استاد بدون قرارداد — از فهرست محاسبه می‌افتد */ }
  }
  const totals = list.reduce((a, x) => ({
    budget: a.budget + x.net, paid: a.paid + x.midtermPaid + x.finalPaid,
    remaining: a.remaining + (x.status === 'FINAL_SETTLED' ? 0 : x.remaining),
    remaining: a.remaining + (x.status === 'FINAL_SETTLED' ? 0 : x.remaining),
  }), { budget: 0, paid: 0, remaining: 0 });
  return { term: term.title, list, totals };
}

/** علی‌الحساب میان‌ترم (۴۰٪) — سند §۱۷۸۳ */
function payMidterm(staffId, pct = 40, actorUserId) {
  return tx(() => {
    const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
    const ps = db.prepare(`SELECT ps.*, c.staffId FROM payroll_statements ps JOIN professor_term_contracts c ON c.id = ps.contractId WHERE c.staffId=? AND c.termId=?`).get(staffId, term.id);
    if (!ps) throw new Error('ابتدا فیش ترم را محاسبه کنید.');
    if (ps.status !== 'DRAFT') throw new Error('علی‌الحساب میان‌ترم قبلاً پرداخت یا تسویه شده است.');
    const amount = Math.round(Number(ps.netAmount) * pct / 100);
    db.prepare(`UPDATE payroll_statements SET midtermPaidAmount=?, midtermPaidAt=CURRENT_TIMESTAMP, status='MID_TERM_PAID' WHERE id=?`).run(amount, ps.id);
    const st = getStaff(staffId);
    notify(st.userId, 'PAYROLL_MIDTERM', { amount: amount.toLocaleString('fa-IR') },
      `استاد گرامی، علی‌الحساب میان‌ترم حق‌التدریس شما به مبلغ ${amount.toLocaleString('fa-IR')} ریال پرداخت شد.`);
    rbac.audit({ actorUserId, action: 'PAYROLL_MIDTERM', entityType: 'staff', entityId: staffId, details: { amount } });
    return { ok: true, amount };
  });
}

/** تسویهٔ نهایی — هر دو گلوگاه باید باز باشد */
function settleFinal(staffId, actorUserId) {
  return tx(() => {
    const term = db.prepare(`SELECT * FROM academic_terms WHERE isCurrent = 1`).get();
    const ps = db.prepare(`SELECT ps.*, c.staffId FROM payroll_statements ps JOIN professor_term_contracts c ON c.id = ps.contractId WHERE c.staffId=? AND c.termId=?`).get(staffId, term.id);
    if (!ps) throw new Error('ابتدا فیش ترم را محاسبه کنید.');
    if (ps.status === 'FINAL_SETTLED') throw new Error('این فیش قبلاً تسویه شده است.');
    const gates = getGates(staffId, term.id);
    if (!gates.gradesFinalized) throw new Error(`گلوگاه تسویه: ${gates.pendingGrades} نمره هنوز FINALIZED نشده است. (اهرم ثبت نمرات)`);
    if (!gates.docsSigned) throw new Error(`گلوگاه تسویه: ${gates.unsignedDocs} سند الکترونیکی امضانشده دارید.`);
    const remaining = Math.max(0, Number(ps.netAmount) - Number(ps.midtermPaidAmount || 0));
    db.prepare(`UPDATE payroll_statements SET finalPaidAmount=?, finalPaidAt=CURRENT_TIMESTAMP, status='FINAL_SETTLED' WHERE id=?`).run(remaining, ps.id);
    const st = getStaff(staffId);
    notify(st.userId, 'PAYROLL_SETTLED', { amount: remaining.toLocaleString('fa-IR') },
      `استاد گرامی، تسویهٔ نهایی حق‌التدریس ترم به مبلغ ${remaining.toLocaleString('fa-IR')} ریال انجام شد. سپاس از به‌موقع‌بودن ثبت نمرات.`);
    rbac.audit({ actorUserId, action: 'PAYROLL_SETTLED', entityType: 'staff', entityId: staffId, details: { remaining } });
    return { ok: true, amount: remaining };
  });
}

/** خروجی واریز دسته‌جمعی (Batch Payment) — CSV بانکی */
function exportBatch() {
  const ov = getOverview();
  const lines = ['شناسه پرسنلی,نام استاد,مبلغ قابل واریز (ریال),وضعیت'];
  for (const x of ov.list) {
    if (x.status === 'NOT_COMPUTED') continue;
    const amt = x.status === 'FINAL_SETTLED' ? 0 : x.remaining;
    lines.push(`"${x.staffId}","${x.name}",${amt},${x.status}`);
  }
  return { csv: lines.join('\n'), count: lines.length - 1, term: ov.term, totals: ov.totals };
}

module.exports = { calcStaffPayroll, computeTermPayroll, getStaffPayslip, getOverview, payMidterm, settleFinal, exportBatch, getGates };
