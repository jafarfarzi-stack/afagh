'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  موتور آیین‌نامه‌های آموزشی (Regulation Engine)
 *  — قوانین از کد خارج شده و به صورت «داده» در educational_regulations
 *    ذخیره می‌شوند. هیچ عدد آموزشی در کد هاردکد نیست.
 * ══════════════════════════════════════════════════════════════════════
 * ساختار rulesConfig (مطابق طرح):
 * {
 *   "regular_term_rules":  { minUnits, maxUnits, probationMaxUnits, gpaA MaxUnits }
 *   "summer_term_rules":   { defaultMaxUnits, graduatingMaxUnits }
 *   "graduating_term_rules": { canTakeWithProbation, maxUnits }
 *   "quota_overrides":     { SHAHED_ISARGAR: { summer_term_rules: {...} } }
 *   "failed_course_gpa_policy": "KEEP_ALWAYS" | "EXCLUDE_IF_PASSED"
 *   "probation_gpa_threshold": 12, "max_allowed_probations": 3,
 *   "max_study_semesters": 8, "gpaA_threshold": 17
 * }
 */
const { db } = require('../db');

/** واکشی آیین‌نامه فعال دانشجو بر اساس regulationId */
function getStudentRegulation(studentId) {
  const row = db.prepare(`
    SELECT r.*, s.entryYear, s.quotaType, s.status, s.degreeLevelId,
           s.extraAllowedSemesters, s.extraAllowedProbations,
           dl.code AS levelCode, dl.defaultPassingGrade, dl.conditionalGpaThreshold
    FROM students s
    JOIN educational_regulations r ON r.id = s.regulationId
    JOIN degree_level_configs dl    ON dl.id = s.degreeLevelId
    WHERE s.id = ?`).get(studentId);
  if (!row) return null;
  return { ...row, rules: JSON.parse(row.rulesConfig) };
}

/**
 * آیا دانشجو «ترم آخر» است؟ (Remaining = حداقل کل واحدها − واحدهای گذرانده)
 */
function isGraduating(studentId) {
  const stu = db.prepare(`
    SELECT s.*, sy.minTotalUnitsToGraduate
    FROM students s LEFT JOIN syllabuses sy
      ON sy.majorId = s.majorId
     AND s.entryYear >= sy.entryYearStart
     AND (sy.entryYearEnd IS NULL OR s.entryYear <= sy.entryYearEnd)
    WHERE s.id = ?`).get(studentId);
  if (!stu || !stu.minTotalUnitsToGraduate) return false;
  const passedUnits = computePassedUnits(studentId);
  return (stu.minTotalUnitsToGraduate - passedUnits) <= 8;
}

/** واحدهای گذرانده (نمره ≥ نمره قبولی مقطع یا PASS توصیفی) */
function computePassedUnits(studentId) {
  const rows = db.prepare(`
    SELECT c.units, c.gradingType, c.affectsGpa, e.gradeValue, e.gradeStatus
    FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId
    JOIN courses c ON c.id = o.courseId
    WHERE e.studentId = ?`).all(studentId);
  const reg = getStudentRegulation(studentId);
  let total = 0;
  for (const r of rows) {
    if (r.gradeStatus !== 'FINALIZED') continue;
    if (r.gradingType === 'DESCRIPTIVE') { if (r.gradeValue === 1) total += r.units; continue; }
    const passing = reg ? reg.defaultPassingGrade : 10;
    if (r.gradeValue !== null && r.gradeValue >= passing) total += r.units;
  }
  return total;
}

/**
 * محاسبه سقف و کف واحد دانشجو برای ترم جاری
 * ترتیب اعمال (مطابق طرح): پایه → مشروطی → معدل الف → ترم آخر → تابستان → سهمیه (Override)
 * @returns {{minUnits,maxUnits,reasons:string[]}}
 */
function getUnitLimits(studentId, term) {
  const reg = getStudentRegulation(studentId);
  if (!reg) throw new Error('دانشجو یافت نشد');
  const reasons = [];
  const rules = reg.rules;
  const base = term.isSummer
    ? { min: 0, max: rules.summer_term_rules?.defaultMaxUnits ?? 6 }
    : { min: rules.regular_term_rules?.minUnits ?? 12, max: rules.regular_term_rules?.maxUnits ?? 20 };

  reasons.push(term.isSummer ? 'قاعده پایه ترم تابستان' : 'قاعده پایه ترم عادی');

  let { min, max } = base;

  if (!term.isSummer) {
    // مشروطی ترم قبل → سقف محدود
    const lastGpa = getLastFinalizedTermGpa(studentId);
    if (lastGpa !== null && lastGpa < Number(rules.probation_gpa_threshold ?? 12)) {
      max = rules.regular_term_rules?.probationMaxUnits ?? 14;
      reasons.push(`مشروطی (معدل ترم قبل ${lastGpa.toFixed(2)} < ${rules.probation_gpa_threshold}) → سقف ${max}`);
    } else if (lastGpa !== null && lastGpa >= (rules.gpaA_threshold ?? 17)) {
      max = rules.regular_term_rules?.gpaA_MaxUnits ?? 24;
      reasons.push(`معدل الف (${lastGpa.toFixed(2)} ≥ ${rules.gpaA_threshold}) → سقف ${max}`);
    }
    // ترم آخر
    if (isGraduating(studentId) && rules.graduating_term_rules) {
      max = Math.max(max, rules.graduating_term_rules.maxUnits ?? max);
      reasons.push('شناسایی خودکار «ترم آخر» (واحدهای باقیمانده ≤ ۸)');
    }
  } else if (isGraduating(studentId)) {
    max = rules.summer_term_rules?.graduatingMaxUnits ?? 8;
    reasons.push(`ترم آخر در تابستان → سقف ${max}`);
  }

  // استثنائات سهمیه‌ای (مثلاً شاهد و ایثارگر) — Override بر قواعد
  const quotaRules = (rules.quota_overrides || {})[reg.quotaType];
  if (quotaRules) {
    if (term.isSummer && quotaRules.summer_term_rules?.defaultMaxUnits) {
      max = Math.max(max, quotaRules.summer_term_rules.defaultMaxUnits);
      reasons.push(`سهمیه ${reg.quotaType} → سقف تابستان ${max}`);
    }
    if (quotaRules.probationMaxUnits && !term.isSummer) {
      const lastGpa = getLastFinalizedTermGpa(studentId);
      if (lastGpa !== null && lastGpa < Number(rules.probation_gpa_threshold ?? 12)) {
        max = quotaRules.probationMaxUnits;
        reasons.push(`سهمیه ${reg.quotaType} (مشروطی) → سقف ${max}`);
      }
    }
  }

  return { minUnits: min, maxUnits: max, reasons, lastGpa: getLastFinalizedTermGpa(studentId) };
}

/** معدل ترم آخرِ قطعی‌شده دانشجو */
function getLastFinalizedTermGpa(studentId) {
  const row = db.prepare(`
    SELECT o.termId, t.termCode FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId
    JOIN academic_terms t ON t.id = o.termId
    WHERE e.studentId = ? AND e.gradeStatus = 'FINALIZED'
    ORDER BY t.termCode DESC LIMIT 1`).get(studentId);
  if (!row) return null;
  const { computeTermGpa } = require('./gpa');
  const res = computeTermGpa(studentId, row.termId);
  return res ? res.gpa : null;
}

/**
 * ارزیابی پایان ترم (Event Trigger مطابق طرح):
 * پس از قطعی شدن نمرات — شمارش مشروطی‌ها و اعلام رویداد
 * @returns {{event:string|null, probationCount:number}}
 */
function evaluateEndOfTerm(studentId) {
  const reg = getStudentRegulation(studentId);
  if (!reg) return { event: null, probationCount: 0 };
  const { computeTermGpaHistory } = require('./gpa');
  const terms = computeTermGpaHistory(studentId);
  const threshold = Number(reg.rules.probation_gpa_threshold ?? 12);
  const probations = terms.filter(t => t.gpa !== null && t.gpa < threshold).length;
  const maxProbations = Number(reg.rules.max_allowed_probations ?? 3) + reg.extraAllowedProbations;
  if (probations > maxProbations) return { event: 'MAX_PROBATION_REACHED', probationCount: probations };
  const semesters = terms.length;
  const maxSem = Number(reg.rules.max_study_semesters ?? 8) + reg.extraAllowedSemesters;
  if (semesters >= maxSem) return { event: 'MAX_SEMESTERS_REACHED', probationCount: probations };
  return { event: null, probationCount: probations };
}

/** نمره قبولی مؤثر برای یک درس (اورراید درس > پیشفرض مقطع) */
function resolvePassingGrade(courseId, studentRegulation) {
  const ov = db.prepare(`
    SELECT customPassingGrade FROM course_rules
    WHERE courseId = ? AND customPassingGrade IS NOT NULL LIMIT 1`).get(courseId);
  if (ov) return Number(ov.customPassingGrade);
  return Number(studentRegulation.defaultPassingGrade);
}

module.exports = {
  getStudentRegulation, getUnitLimits, isGraduating, computePassedUnits,
  getLastFinalizedTermGpa, evaluateEndOfTerm, resolvePassingGrade
};
