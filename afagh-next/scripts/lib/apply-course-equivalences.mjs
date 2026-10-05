/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  منطق خالص رانرِ اعمالِ معادل‌سازی‌های تأییدشده روی کارنامه (APPLY)
 *
 *  قراردادِ نام‌گذاریِ ریپو (مستند در course-equivalence.mjs): منطقِ قابل‌تست
 *  در `scripts/lib/` و پوستهٔ اجراییِ نازک در `scripts/`. نامِ `apply-`
 *  یعنی «نوشتن در کارنامه» (مثل apply-0010-fix34038.mjs و apply-patches.mjs)
 *  و جمعِ `equivalences` همان نامِ جدولِ `course_equivalences` است؛ در برابر
 *  `course-equivalence.mjs` که فقط پیشنهاد/بازبینی/تصمیم می‌سازد و هرگز
 *  کارنامه را دست نمی‌زند.
 *
 *  این فایل «خالص» است: نه DB، نه fs، نه process — تا زیر node خام و tsx
 *  قابل تست باشد. scripts/*.mjs زیر node خام نمی‌توانند از src/*.ts ایمپورت
 *  کنند (ERR_UNKNOWN_FILE_EXTENSION)، پس قاعدهٔ قبولی/معدل اینجا آینهٔ
 *  `src/lib/grade-status-codes.ts` و `src/lib/gpa-aggregation.ts` است و تستِ
 *  `tests/apply-course-equivalences.test.ts` برابری‌شان را قفل می‌کند.
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ───────────────────────────────────────────────────────────────────────────
//  ۱) کدِ سمای ردیفِ انتقالی — «۱۶» و چرا نه چیزِ دیگر
// ───────────────────────────────────────────────────────────────────────────
//
//  جدولِ مرجع `src/lib/grade-status-codes.ts` (میز تطبیق GRADE_STATUS):
//    { code:'16', title:'در معادل سازي پذيرفته شده بدون احتساب معدل',
//      passed:true, affectsGpa:false, affectsTermGpa:false }
//
//  * passed=true ⇒ واحدش در passedUnits هر دو موتور شمرده می‌شود (درسِ
//    منتقل‌شده باید واحد بدهد)؛
//  * affectsGpa=false (+ affectsTermGpa=false) ⇒ نمره‌اش نه در صورت و نه در
//    مخرجِ معدلِ کل/نیمسال می‌آید (`rowCountsTowardGpa` همین را برمی‌گرداند)؛
//  * در `REGULATION_FROZEN_CODES` هم هست ⇒ موتورِ آیین‌نامه هرگز بازنویسی‌اش
//    نمی‌کند (پایدار می‌ماند).
//
//  چرا نه ۱۷/۱۲/۳۲/۴۴/۵۳ (بقیهٔ قبولی‌های بدون احتساب)؟ عنوانِ ۱۷ «جزوِ واحد»
//  است (پذیرشِ جزئی/واحدی، نه کلِ درس)، ۱۲/۳۲ جبرانی‌اند، ۴۴ پیش‌دانشگاهی و
//  ۵۳ خودخوان است. فقط ۱۶ «پذیرفته‌شده در معادل‌سازی»یِ کامل است.
//  چرا نه ۳ («پذیرفته شده با احتساب در معدل کل»؟ چون معدلِ رسمیِ دانشجو را
//  — که از دانشگاهِ منحل‌شده آمده و مبنایش متفاوت است — وارد معدلِ آفاق
//  می‌کرد و GPA را بی‌صدا جابه‌جا می‌کرد.

/** کدِ سمای ردیفِ انتقالی: قبولیِ بدون احتساب در معدل (واحد می‌دهد، نمره نه). */
export const EQUIV_SAMA_CODE = '16';

/** وضعِ نمرهٔ ردیفِ انتقالی: قطعی (تا در فیلترِ gradeStatus هر دو موتور بیاید). */
export const EQUIV_GRADE_STATUS = 'FINALIZED';

/** وضعِ ثبتِ ردیفِ انتقالی — همان قراردادِ `applyEquivalenceBatch`. */
export const EQUIV_ENROLL_STATUS = 'EQUIV_PASSED';

/** قراردادِ جای‌گذاریِ هدف — همان قراردادِ `applyEquivalenceBatch`. */
export const EQUIV_TERM_TYPE = 'EQUIVALENCE';
export const EQUIV_OFFERING_TYPE = 'TRANSFER';
export const EQUIV_TERM_CODE = '00EQ1';
export const EQUIV_TERM_TITLE = 'معادل‌سازی — نوبت 1';
export const EQUIV_GROUP_NUMBER = 900;
export const EQUIV_CAPACITY = 500;

// ───────────────────────────────────────────────────────────────────────────
//  ۲) قاعدهٔ «قبول» — آینهٔ موتورها
// ───────────────────────────────────────────────────────────────────────────
//
//  تعریفِ دقیق (graduation-engine.ts + gpa-aggregation.ts `isPassedRow` /
//  `aggregateAuditTranscript` + resolve-sama-code.ts `isPassed`):
//    gradeStatus ∈ {FINALIZED, EXEMPT, PASSED_NO_GRADE}  AND
//    ( gradeStatus ∈ {EXEMPT, PASSED_NO_GRADE}           → قبول
//      OR isPassedStatusCode(samaGradeStatusCode)        → قبول
//      OR (FINALIZED AND نمره ≥ حدِ همان درس)            → قبول )
//  حدِ همان درس: minPassedMark معتبرِ درس (عددیِ متناهی در [0,20])، وگرنه کفِ
//  آیین‌نامهٔ دانشجو (runner آن را از regulation/degree می‌سازد و اینجا آماده
//  تحویل می‌گیرد)؛ درسِ توصیفی: نمره دقیقاً ۱.

/** gradeStatusهایی که موتورها اصلاً به‌عنوان «سابقهٔ نهایی» می‌بینند. */
export const FINAL_LIKE_STATUSES = ['FINALIZED', 'EXEMPT', 'PASSED_NO_GRADE'];

/**
 * کدهای سمایی که در جدولِ مرجع `passed:true` دارند — آینهٔ دستیِ
 * `GRADE_STATUS_CODES.filter(g => g.passed)` (همان فهرستِ `PASSED_SAMA_CODES`
 * در course-equivalence.mjs). تست، برابری با جدولِ مرجع را قفل می‌کند.
 */
export const PASSED_SAMA_CODES = new Set(
  ['1', '3', '11', '12', '16', '17', '18', '23', '27', '32', '40', '44', '50', '53', '54'],
);

/** آیا کدِ سما «قبولی» است؟ (آینهٔ `isPassedStatusCode`) */
export function isPassedSamaCode(code) {
  if (code === null || code === undefined) return false;
  return PASSED_SAMA_CODES.has(String(code).trim());
}

/** حدِ قبولیِ همان درس: minPassedMark معتبر، وگرنه کفِ آیین‌نامه (آینهٔ thresholdFactory). */
export function passThreshold(minPassedMark, regulationPassing) {
  const m = minPassedMark === null || minPassedMark === undefined ? NaN : Number(minPassedMark);
  if (Number.isFinite(m) && m >= 0 && m <= 20) return m;
  const p = Number(regulationPassing);
  return Number.isFinite(p) && p > 0 ? p : 10;
}

export function parseGrade(v) {
  if (v === null || v === undefined) return null;
  const raw = typeof v === 'number' ? v : String(v).trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * آیا این ردیفِ کارنامه «پاس‌شده» است؟ دقیقاً همان قاعدهٔ موتورها.
 * ورودی: { gradeValue, gradeStatus, samaGradeStatusCode, gradingType,
 *           minPassedMark, regulationPassing }
 */
export function isPassedEnrollment(row) {
  const st = row?.gradeStatus;
  if (st !== 'FINALIZED' && st !== 'EXEMPT' && st !== 'PASSED_NO_GRADE') return false;
  if (st === 'EXEMPT' || st === 'PASSED_NO_GRADE') return true;
  if (isPassedSamaCode(row?.samaGradeStatusCode)) return true;
  const g = parseGrade(row?.gradeValue);
  if (g === null) return false;
  if (row?.gradingType === 'DESCRIPTIVE') return g === 1;
  return g >= passThreshold(row?.minPassedMark, row?.regulationPassing);
}

// ───────────────────────────────────────────────────────────────────────────
//  ۳) برنامه‌ریز (planner) — خالص و قطعی
// ───────────────────────────────────────────────────────────────────────────

/**
 * احکامِ هر سه‌تاییِ (دانشجوی محلی، درسِ محلی، نمرهٔ آفاق):
 *   APPLY               — قابلِ درج
 *   SKIPPED_NOT_PASSED  — نمرهٔ آفاق با قاعدهٔ موتور «قبول» نیست (خطا نیست)
 *   ALREADY_APPLIED     — همین sourceEnrollmentId قبلاً اعمال شده (idempotency)
 *   ALREADY_PASSED_LOCAL— دانشجوی محلی همین courseIdB را پاس دارد (کلید: courseId، نه عنوان)
 *   NO_LOCAL_COURSE     — ردیفِ درسِ مقصد در کاتالوگِ دانشگاهِ مقصد نیست (BLOCKED)
 *   DUP_COURSE_IN_PLAN  — دو ردیفِ آفاقِ یک نفر به یک courseIdB می‌رسند؛ فقط اولی می‌نشیند
 */
export const VERDICTS = Object.freeze({
  APPLY: 'APPLY',
  SKIPPED_NOT_PASSED: 'SKIPPED_NOT_PASSED',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  ALREADY_PASSED_LOCAL: 'ALREADY_PASSED_LOCAL',
  NO_LOCAL_COURSE: 'NO_LOCAL_COURSE',
  DUP_COURSE_IN_PLAN: 'DUP_COURSE_IN_PLAN',
  BLOCKED_NO_TERM: 'BLOCKED_NO_TERM',
});

/** کدام حکم‌ها «مسدود»‌اند (گیتِ --skip-blocked، مثل merge-duplicate-users)؟ */
export const BLOCKED_VERDICTS = new Set([VERDICTS.NO_LOCAL_COURSE, VERDICTS.BLOCKED_NO_TERM]);

/**
 * ساختِ برنامه از داده‌های بارگذاری‌شده (همه‌چیز از DB آماده آمده):
 *   equivalences: [{id, universityIdA, courseIdA, universityIdB, courseIdB, matchMethod}]
 *   pairs: [{afStudentId, localStudentId, universityIdB}]  (جمعیتِ آماده‌سازی)
 *   afaghRows: [{enrollmentId, studentId, courseId, gradeValue, gradeStatus,
 *                samaGradeStatusCode, gradingType, minPassedMark, regulationPassing,
 *                termCode, termTitle, termSortOrder, termAcademicYear, termStartDate, termEndDate}]
 *   localRows: همین شکل برای دانشجویانِ محلی (برای آزمونِ «پاسِ مقصد»)
 *   coursesById: Map courseId → {universityId}
 *   appliedSourceIds: Set<afaghEnrollmentId> (آنچه uq_enrollments_source_enrollment دارد)
 *
 * ترتیبِ خروجی قطعی است (equivId, localStudentId, afaghEnrollmentId) تا CSV و
 * تست پایدار باشند.
 */
export function buildPlan({ equivalences, pairs, afaghRows, localRows, coursesById, appliedSourceIds }) {
  const applied = appliedSourceIds instanceof Set ? appliedSourceIds : new Set(appliedSourceIds || []);

  const afByStudentCourse = new Map(); // `${studentId}:${courseId}` → [rows]
  for (const r of afaghRows || []) {
    const k = `${r.studentId}:${r.courseId}`;
    if (!afByStudentCourse.has(k)) afByStudentCourse.set(k, []);
    afByStudentCourse.get(k).push(r);
  }
  const localByStudentCourse = new Map();
  for (const r of localRows || []) {
    const k = `${r.studentId}:${r.courseId}`;
    if (!localByStudentCourse.has(k)) localByStudentCourse.set(k, []);
    localByStudentCourse.get(k).push(r);
  }

  const pairsByAf = new Map(); // afStudentId → [pair]
  for (const p of pairs || []) {
    if (!pairsByAf.has(p.afStudentId)) pairsByAf.set(p.afStudentId, []);
    pairsByAf.get(p.afStudentId).push(p);
  }

  const triples = [];
  const eqs = [...(equivalences || [])].sort((a, b) => a.id - b.id);
  for (const e of eqs) {
    const courseB = coursesById?.get(e.courseIdB);
    const localCourseOk = Boolean(courseB) && Number(courseB.universityId) === Number(e.universityIdB);
    for (const [afStudentId, plist] of pairsByAf) {
      const srcRows = afByStudentCourse.get(`${afStudentId}:${e.courseIdA}`) || [];
      for (const s of srcRows) {
        for (const p of plist) {
          if (Number(p.universityIdB) !== Number(e.universityIdB)) continue;
          triples.push({ e, p, s, localCourseOk });
        }
      }
    }
  }
  triples.sort((a, b) =>
    a.e.id - b.e.id || a.p.localStudentId - b.p.localStudentId || a.s.enrollmentId - b.s.enrollmentId);

  const plan = [];
  for (const { e, p, s } of triples) {
    const base = {
      equivalenceId: e.id,
      matchMethod: e.matchMethod || '',
      universityIdA: e.universityIdA,
      universityIdB: e.universityIdB,
      courseIdA: e.courseIdA,
      courseIdB: e.courseIdB,
      afaghStudentId: s.studentId,
      localStudentId: p.localStudentId,
      afaghEnrollmentId: s.enrollmentId,
      gradeValue: s.gradeValue === undefined || s.gradeValue === null ? null : String(s.gradeValue),
      // ترمِ مبدأِ آفاق — مقصد باید دقیقاً همین کدِ ترم، در ترم عادیِ دانشگاه محلی بنشیند
      afaghTermCode: s.termCode ?? null,
      afaghTermTitle: s.termTitle ?? null,
      afaghTermSortOrder: s.termSortOrder ?? null,
      afaghTermAcademicYear: s.termAcademicYear ?? null,
      afaghTermStartDate: s.termStartDate ?? null,
      afaghTermEndDate: s.termEndDate ?? null,
    };
    const courseB = coursesById?.get(e.courseIdB);
    if (!courseB || Number(courseB.universityId) !== Number(e.universityIdB)) {
      plan.push({ ...base, verdict: VERDICTS.NO_LOCAL_COURSE, reason: `درسِ مقصد courseId=${e.courseIdB} در کاتالوگِ دانشگاه ${e.universityIdB} نیست` });
      continue;
    }
    if (!isPassedEnrollment(s)) {
      plan.push({ ...base, verdict: VERDICTS.SKIPPED_NOT_PASSED, reason: `نمرهٔ آفاق (${s.gradeValue ?? '—'}/${s.gradeStatus ?? '—'}/${s.samaGradeStatusCode ?? '—'}) با قاعدهٔ موتور «قبول» نیست` });
      continue;
    }
    if (applied.has(s.enrollmentId)) {
      plan.push({ ...base, verdict: VERDICTS.ALREADY_APPLIED, reason: `sourceEnrollmentId=${s.enrollmentId} قبلاً اعمال شده (uq_enrollments_source_enrollment)` });
      continue;
    }
    const localSame = localByStudentCourse.get(`${p.localStudentId}:${e.courseIdB}`) || [];
    if (localSame.some((r) => isPassedEnrollment(r))) {
      plan.push({ ...base, verdict: VERDICTS.ALREADY_PASSED_LOCAL, reason: `دانشجوی محلی courseId=${e.courseIdB} را پاس دارد (کلید: courseId، نه عنوان)` });
      continue;
    }
    plan.push({ ...base, verdict: VERDICTS.APPLY, reason: '' });
  }

  // نگهبانِ (v): دو ردیفِ آفاقِ یک نفر → یک courseIdB. فقط اولی APPLY می‌ماند.
  // (ترتیبِ قطعیِ بالا یعنی «اولی» همیشه همان است — کمترین equivId/enrollmentId.)
  const seen = new Set();
  for (const row of plan) {
    if (row.verdict !== VERDICTS.APPLY) continue;
    const k = `${row.localStudentId}:${row.courseIdB}`;
    if (seen.has(k)) {
      row.verdict = VERDICTS.DUP_COURSE_IN_PLAN;
      row.reason = 'همین (دانشجو، درسِ مقصد) با نمرهٔ آفاقِ دیگری در همین برنامه پوشش داده شد؛ دومی نوشته نمی‌شود';
    } else {
      seen.add(k);
    }
  }
  return plan;
}

/** شمارشِ برنامه بر اساسِ حکم. */
export function summarizePlan(plan) {
  const by = {};
  for (const v of Object.values(VERDICTS)) by[v] = 0;
  for (const r of plan || []) by[r.verdict] = (by[r.verdict] || 0) + 1;
  return { total: (plan || []).length, by };
}

// ───────────────────────────────────────────────────────────────────────────
//  ۴) CSVِ برنامه (per-triple plan)
// ───────────────────────────────────────────────────────────────────────────

export const PLAN_COLUMNS = [
  'verdict', 'reason', 'equivalence_id', 'match_method', 'university_b',
  'afagh_student_id', 'local_student_id', 'afagh_enrollment_id',
  'course_id_a', 'course_id_b', 'grade_value', 'afagh_term_code',
];

const CSV_QUOTE = /[",\r\n]/;
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return CSV_QUOTE.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function planToCsv(plan, columns = PLAN_COLUMNS) {
  const key = {
    verdict: 'verdict', reason: 'reason', equivalence_id: 'equivalenceId',
    match_method: 'matchMethod', university_b: 'universityIdB',
    afagh_student_id: 'afaghStudentId', local_student_id: 'localStudentId',
    afagh_enrollment_id: 'afaghEnrollmentId', course_id_a: 'courseIdA',
    course_id_b: 'courseIdB', grade_value: 'gradeValue', afagh_term_code: 'afaghTermCode',
  };
  const lines = [columns.join(',')];
  for (const r of plan || []) lines.push(columns.map((c) => csvCell(r[key[c]])).join(','));
  return lines.join('\n') + '\n';
}
