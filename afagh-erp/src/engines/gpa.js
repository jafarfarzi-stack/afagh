'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════
 *  موتور محاسبه معدل (GPA Calculator Engine)
 *  سیاست‌ها از آیین‌نامه خوانده می‌شود:
 *   - failed_course_gpa_policy = KEEP_ALWAYS      → نمره ردی همیشه در معدل می‌ماند (ورودی ۱۳۹۰)
 *   - failed_course_gpa_policy = EXCLUDE_IF_PASSED→ بعد از قبولی، ردی قبلی از صورت و مخرج حذف می‌شود
 *   - دروس توصیفی (DESCRIPTIVE): فقط واحد گذرانده، بی‌اثر در معدل
 *   - affectsGpa=false (مثل جبرانی ارشد): نمره ثبت می‌شود ولی معدل نمی‌گیرد
 * ══════════════════════════════════════════════════════════════════════
 */
const { db } = require('../db');
const { getStudentRegulation, resolvePassingGrade } = require('./regulations');

function loadFinalEnrollments(studentId) {
  return db.prepare(`
    SELECT e.id AS enrollmentId, e.gradeValue, e.gradeStatus, e.status,
           c.id AS courseId, c.code, c.title, c.units, c.gradingType, c.affectsGpa,
           t.id AS termId, t.termCode, t.title AS termTitle
    FROM enrollments e
    JOIN course_offerings o ON o.id = e.offeringId
    JOIN courses c ON c.id = o.courseId
    JOIN academic_terms t ON t.id = o.termId
    WHERE e.studentId = ? AND e.status IN ('REGISTERED','DROPPED_ZERO','ABSENT')
    ORDER BY t.termCode`).all(studentId);
}

/** کارنامه کامل ترم به ترم + معدل کل — مطابق سیاست آیین‌نامه دانشجو */
function computeTranscript(studentId) {
  const reg = getStudentRegulation(studentId);
  if (!reg) return null;
  const policy = reg.rules.failed_course_gpa_policy || 'KEEP_ALWAYS';
  const rows = loadFinalEnrollments(studentId);

  // courseId → بهترین قبولی و لیست ردی‌ها
  const byCourse = new Map();
  for (const r of rows) {
    if (r.gradeStatus !== 'FINALIZED' && !(r.status === 'ABSENT' && r.gradeValue !== null)) continue;
    if (r.status === 'DROPPED_ZERO') continue;
    const passing = resolvePassingGrade(r.courseId, reg);
    const isDescriptive = r.gradingType === 'DESCRIPTIVE';
    const grade = r.gradeValue === null ? 0 : Number(r.gradeValue); // غیبت غیرموجه = صفر
    const passed = isDescriptive ? grade === 1 : grade >= passing;
    const arr = byCourse.get(r.courseId) || [];
    arr.push({ ...r, gradeNum: grade, passed, passing, isDescriptive });
    byCourse.set(r.courseId, arr);
  }

  const termMap = new Map(); // termId → {items, weighted, units}
  for (const [courseId, attempts] of byCourse) {
    const best = attempts.find(a => a.passed) || null;
    for (const a of attempts) {
      // آیا این تلاش در معدل لحاظ شود؟
      let include = true; let excludedBecause = null;
      if (!a.isDescriptive && Number(a.affectsGpa) === 0) { include = false; excludedBecause = 'بی‌اثر در معدل (جبرانی)'; }
      if (a.isDescriptive) { include = false; excludedBecause = 'توصیفی (قبول/رد)'; }
      if (policy === 'EXCLUDE_IF_PASSED' && !a.passed && best) { include = false; excludedBecause = 'ردیِ قبلاً جبران‌شده (آیین‌نامه ۱۴۰۳)'; }

      let shownGrade = a.gradeNum, countedUnits = Number(a.units);
      if (a.isDescriptive) shownGrade = a.passed ? 'قبول' : 'رد';
      if (policy === 'EXCLUDE_IF_PASSED' && !a.passed && best) shownGrade = `${a.gradeNum}★`;

      const t = termMap.get(a.termId) || {
        termCode: a.termCode, termTitle: a.termTitle, items: [],
        weighted: 0, units: 0, passedUnits: 0
      };
      t.items.push({
        code: a.code, title: a.title, units: Number(a.units), grade: shownGrade,
        passed: a.passed, inGpa: include, note: excludedBecause,
        repeatedLater: (!a.passed && !!best)
      });
      if (include) { t.weighted += a.gradeNum * Number(a.units); t.units += Number(a.units); }
      if (a.passed) t.passedUnits += Number(a.units);
      termMap.set(a.termId, t);
    }
  }

  const terms = [...termMap.entries()].map(([termId, t]) => ({
    termId, termCode: t.termCode, termTitle: t.termTitle,
    gpa: t.units > 0 ? +(t.weighted / t.units).toFixed(2) : null,
    units: t.units, passedUnits: t.passedUnits, courses: t.items
  }));

  let weighted = 0, units = 0;
  for (const t of terms) { weighted += t.gpa * t.units; units += t.units; }
  return {
    policy,
    regulationTitle: reg.title,
    terms,
    overallGpa: units > 0 ? +(weighted / units).toFixed(2) : null,
    totalPassedUnits: terms.reduce((a, t) => a + t.passedUnits, 0),
    totalGpaUnits: units
  };
}

/** معدل یک ترم مشخص */
function computeTermGpa(studentId, termId) {
  const tr = computeTranscript(studentId);
  if (!tr) return null;
  return tr.terms.find(t => t.termId === termId) || null;
}

/** تاریخچه معدل (برای شمارش مشروطی) */
function computeTermGpaHistory(studentId) {
  const tr = computeTranscript(studentId);
  return tr ? tr.terms.filter(t => t.gpa !== null) : [];
}

module.exports = { computeTranscript, computeTermGpa, computeTermGpaHistory };
