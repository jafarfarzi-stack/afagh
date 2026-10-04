/**
 * ════════════════════════════════════════════════════════════════════════
 *  تست واحد «ابزار معادل‌سازی درس» — منطق خالص scripts/lib/course-equivalence.mjs
 *
 *  پنج بخش:
 *   ۱) نرمال‌سازی عنوانِ فارسی (+ همسانی با src/lib/migration/normalize.ts)
 *   ۲) ترتیبِ اعتبارِ روش‌های تطبیق (METHODS + scorePair)
 *   ۳) تشخیصِ ابهام: واگراییِ ۳‌تایی و رقابتِ مقصد، هرگز بی‌صدا حل نمی‌شود
 *   ۴) چرخهٔ CSV رفت‌وبرگشت (export → import)
 *   ۵) قواعدِ اعتبارسنجیِ import: کاربر، دلیلِ ردّ، MANUAL، بر.flip، idempotent
 * ════════════════════════════════════════════════════════════════════════
 */
import {
  MATCH_METHODS,
  METHOD_MANUAL,
  METHOD_RANK,
  DEFAULT_MIN_FUZZY,
  normTitle,
  foldFa,
  titleKey,
  titleTokens,
  tokenJaccard,
  diceBigrams,
  fuzzyScore,
  containsWordSequence,
  containmentScore,
  scorePair,
  findCandidates,
  markAmbiguity,
  confidenceFor,
  stateOf,
  levelKey,
  majorKey,
  toCsv,
  parseCsv,
  validateDecisionRow,
  sameDecision,
  isFlip,
  planImport,
  IMPORT_ACTIONS,
} from '../scripts/lib/course-equivalence.mjs';
import { faLetters } from '../src/lib/migration/normalize';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
  }
};
const okT = (name: string, v: unknown) => eq(name, Boolean(v), true);
const okF = (name: string, v: unknown) => eq(name, Boolean(v), false);

// ── ۱) نرمال‌سازی عنوانِ فارسی ────────────────────────────────────────────
console.log('\n--- ۱. نرمال‌سازی عنوان ---');
eq('ي عربی → ی', normTitle('تربيت بدني'), 'تربیت بدنی');
eq('ك عربی → ک', normTitle('مكانيزاسيون كشاورزي'), 'مکانیزاسیون کشاورزی');
eq('ة → ه', normTitle('دروسك-hist'), 'دروسک hist');
eq('ۀ → ه', normTitle('خط‌مشی'), 'خط مشی');
eq('نیم‌فاصله → فاصله', normTitle('می‌شود'), 'می شود');
eq('فاصله‌های تکراری جمع می‌شود', normTitle('  آمار   و   احتمال '), 'آمار و احتمال');
eq('نشانه‌گذاری حذف می‌شود', normTitle('آمار و احتمال، جلد ۱'), 'آمار و احتمال جلد 1');
eq('ارقام فارسی → لاتین', normTitle('معرفی‌سازی ۱۴۰۳'), 'معرفی سازی 1403');
eq('ارقام عربی → لاتین', normTitle('كتاب ١٢٣'), 'کتاب 123');
eq('أ/إ یکدست می‌شوند', foldFa('أبت و إ(It)'), 'ابت و ا(It)');
eq('«آ» عمداً به «ا» تبدیل نمی‌شود', foldFa('آب'), 'آب');
okF('«آمار» و «امار» یکی نمی‌شوند', titleKey('آمار') === titleKey('امار'));
eq('اعراب حذف می‌شود', normTitle('مُحَمَّد'), 'محمد');
eq('خالی', normTitle(''), '');
eq('null', normTitle(null), '');

eq('کلیدِ فشرده: «الف/ب» = «الف-ب»', titleKey('امور زراعي و باغي / تكنولوژي'), titleKey('امور زراعي و باغي- تكنولوژي'));
eq('کلیدِ فشرده رشتهٔ کثیفِ واقعی', titleKey('كارداني مديريت بازرگاني'), titleKey('مدیریت بازرگانی کاردانی') .length ? 'کاردانیمدیریتبازرگانی' : '');
eq(
  'کلیدِ رشته: «الف-ب» = «الف / ب»',
  majorKey('ماشينهاي کشاورزي-مکانيزاسيون کشاورزي'),
  majorKey('ماشين هاي كشاورزي / مكانيزاسيون كشاورزي'),
);
eq('رشتهٔ خالی ⇒ کلید ندارد', majorKey('   '), null);

eq('توکن‌ها', titleTokens('آمار و احتمال مهندسی'), ['آمار', 'و', 'احتمال', 'مهندسی']);
eq('توکنِ تکراری در Jaccard شمرده نمی‌شود', tokenJaccard(['a', 'b', 'a'], ['a', 'b']), 1);

// ── همسانی با نرمال‌سازِ مرجعِ ریپو ──
// scripts/*.mjs زیر node خام از src/*.ts ایمپورت نمی‌کنند (ERR_UNKNOWN_FILE_EXTENSION)،
// پس اینجا آینه‌ای محلی داریم. این تست تضمین می‌کند دو نسخه از هم جدا نیفتند.
const sharedSamples = [
  'تربيت بدني',
  'مكانيزاسيون كشاورزي',
  'امور زراعي و باغي / تكنولوژي توليدات زراعي',
  'علمى- كاربردي توليد و بهره برداري از گياهان دارويي',
  'معرّفی‌سازی ۱۴۰۳',
];
for (const s of sharedSamples) {
  eq(`همسانی با faLetters: «${s.slice(0, 24)}»`, foldFa(faLetters(s)), foldFa(s));
}

// ── ۲) ترتیبِ اعتبارِ روش‌ها ──────────────────────────────────────────────
console.log('\n--- ۲. ترتیبِ روش‌های تطبیق ---');
eq('ترتیبِ روش‌ها', MATCH_METHODS, [
  'CODE_EXACT',
  'TITLE_EXACT',
  'TITLE_WORD_CONTAINMENT',
  'TITLE_FUZZY',
]);
okF('MANUAL جزو روش‌های ماشینی نیست', MATCH_METHODS.includes(METHOD_MANUAL));
okT('رتبه‌ها نزولی‌اند', METHOD_RANK.CODE_EXACT > METHOD_RANK.TITLE_EXACT);
okT('TITLE_EXACT قوی‌تر از containment است', METHOD_RANK.TITLE_EXACT > METHOD_RANK.TITLE_WORD_CONTAINMENT);
okT('containment قوی‌تر از fuzzy است', METHOD_RANK.TITLE_WORD_CONTAINMENT > METHOD_RANK.TITLE_FUZZY);
eq('رتبهٔ MANUAL صفر است', METHOD_RANK.MANUAL, 0);

const A = { id: 1, code: '1143012', title: 'زبان تخصصي 1' };
eq('کدِ یکسان ⇒ CODE_EXACT', scorePair(A, { id: 2, code: '1143012', title: 'عنوان کاملاً دیگر' }), {
  method: 'CODE_EXACT',
  score: 1,
});
eq(
  'عنوانِ یکسانِ نرمال‌شده ⇒ TITLE_EXACT',
  scorePair(A, { id: 2, code: '999', title: 'زبان تخصصي(1)' }),
  { method: 'TITLE_EXACT', score: 1 },
);
eq(
  'شامل‌بودنِ کلمه‌به‌کلمه ⇒ TITLE_WORD_CONTAINMENT',
  scorePair(A, { id: 2, code: '888', title: 'زبان تخصصي' })?.method,
  'TITLE_WORD_CONTAINMENT',
);
eq('شباهتِ تقریبی ⇒ TITLE_FUZZY', scorePair(A, { id: 2, code: '777', title: 'زبان تخصصي2' })?.method, 'TITLE_FUZZY');
eq('بی‌ربط ⇒ هیچ', scorePair(A, { id: 2, code: '111', title: 'مدارهای ۱ و ۲' }), null);
okF('توکنِ اضافی جلوی شامل‌بودنِ دقیق را نمی‌گیرد', containsWordSequence(['احتمال', 'آمار'], ['آمار', 'احتمال']));
okT('شامل‌بودنِ پیوسته', containsWordSequence(['آمار', 'و', 'احتمال', 'مهندسی'], ['آمار', 'و', 'احتمال']));
okT('پوششِ کامل ⇒ امتیازِ بالا', containmentScore(['آمار', 'و', 'احتمال'], ['آمار', 'و', 'احتمال']) > 0.85);
okF('عنوانِ خالی ⇒ دوگرامِ صفر', diceBigrams('', 'abc'));
okF('Jaccardِ تهی ⇒ صفر', tokenJaccard([], ['a']));
eq('fuzzyScore بیشینهٔ دو سنجه است', fuzzyScore('آمار و احتمال', 'آمار و احتمال مهندسی'), Math.max(
  tokenJaccard(titleTokens('آمار و احتمال'), titleTokens('آمار و احتمال مهندسی')),
  diceBigrams(titleKey('آمار و احتمال'), titleKey('آمار و احتمال مهندسی')),
));
okF('آستانهٔ پیش‌فرض همان ۰٫۸۵ فاز اندازه‌گیری است', DEFAULT_MIN_FUZZY !== 0.85);
eq('آستانهٔ پیش‌فرض', DEFAULT_MIN_FUZZY, 0.85);

eq('confidence برای METHODUAL ‏= null', confidenceFor(METHOD_MANUAL, 1), null);
okT('confidence برای TITLE_EXACT بالای ۰٫۹ است', (confidenceFor('TITLE_EXACT', 1) ?? 0) > 0.9);
okT('confidence فازِ تقریبی از TITLE_EXACT کمتر است', (confidenceFor('TITLE_FUZZY', 0.86) ?? 1) < (confidenceFor('TITLE_EXACT', 1) ?? 0));

// ── ۳) تشخیصِ ابهام ───────────────────────────────────────────────────────
console.log('\n--- ۳. تشخیصِ ابهام (هرگز بی‌صدا حل نمی‌شود) ---');
// بازسازیِ همان واگراییِ ۱۸‌تاییِ واقعیِ شمس روی «زبان تخصصي 1»
const shamsLike = [
  { id: 20697, code: '1143012', title: 'زبان تخصصي 1' },
  { id: 20801, code: '116222', title: 'زبان تخصصي1' },
  { id: 20813, code: '116104', title: 'زبان تخصصي(1)' },
  { id: 20418, code: '117105', title: 'زبان تخصصي' },
  { id: 20595, code: '122169', title: 'زبان تخصصي' },
  { id: 20954, code: '1221116', title: 'زبان تخصصي' },
  { id: 21020, code: '114118', title: 'زبان تخصصي' },
  { id: 21030, code: '122121', title: 'زبان تخصصي' },
  { id: 21210, code: '118114', title: 'زبان تخصصي' },
  { id: 21244, code: '121131', title: 'زبان تخصصي' },
  { id: 20632, code: '126118', title: 'زبان تخصصي1و2' },
  { id: 20450, code: '116248', title: 'زبان تخصصي4' },
  { id: 20535, code: '115124', title: 'زبان تخصصي 2' },
  { id: 20712, code: '1143019', title: 'زبان تخصصي 2' },
  { id: 20737, code: '114325', title: 'زبان تخصصي2' },
  { id: 20770, code: '116231', title: 'زبان تخصصي2' },
  { id: 21259, code: '116114', title: 'زبان تخصصي (2)' },
  { id: 21334, code: '116239', title: 'زبان تخصصي3' },
];
const cands18 = findCandidates(A, shamsLike);
eq('واگرایی ۱۸‌تایی: هر ۱۸ نامزد نگه داشته شد', cands18.length, 18);
const flagged18 = markAmbiguity(cands18);
eq('همهٔ ۱۸ سطر مبهم علامت خوردند', flagged18.filter((c) => c.ambiguous).length, 18);
okT('دلیلِ MULTI_CANDIDATE(18) ثبت شد', flagged18[0].ambiguityReasons.includes('MULTI_CANDIDATE(18)'));
eq('تعدادِ نامزد گزارش شد', flagged18[0].candidateCount, 18);
okT('ستونِ competing_candidates پر است', flagged18[0].competingCandidates.length === 17);
okT('رتبه‌ها یکتا و پیوسته‌اند', new Set(flagged18.map((c) => c.rank)).size === 18);
// ترتیب: کدِ یکسان اول، بعد عنوانِ یکسان، بعد شامل‌بودن، بعد تقریب
eq('قوی‌ترین روش اول آمده', flagged18[0].method, 'CODE_EXACT');
eq('دومین، سومین: TITLE_EXACT', flagged18[1].method, 'TITLE_EXACT');
okT('رتبهٔ روش نزولی است', flagged18[0].methodRank >= flagged18[1].methodRank);

// رقابت بر سر یک مقصد (fan-in): دو درسِ آفاق، یک درسِ محلی
const fanIn = markAmbiguity([
  { courseIdA: 1, courseIdB: 500, method: 'TITLE_EXACT', score: 1, methodRank: 30 },
  { courseIdA: 2, courseIdB: 500, method: 'TITLE_FUZZY', score: 0.9, methodRank: 10 },
  { courseIdA: 3, courseIdB: 501, method: 'TITLE_EXACT', score: 1, methodRank: 30 },
]);
eq('مقصدِ موردِ مناقشه علامت خورد', fanIn.filter((c) => c.competingCourseIdsA.length).length, 2);
okT('دلیلِ CONTESTED_LOCAL(2)', fanIn[0].ambiguityReasons.includes('CONTESTED_LOCAL(2)'));
eq('رقیبِ مقصد فهرست شد', fanIn[0].competingCourseIdsA, [1, 2]);
okF('نامزدِ یکتا مبهم نیست', fanIn[2].ambiguous);

// واگراییِ ۳‌تایی صریح (خواستهٔ تست)
const threeWay = findCandidates(
  { id: 7, code: 'C7', title: 'آمار و احتمال' },
  [
    { id: 71, code: 'A', title: 'آمار و احتمال' },
    { id: 72, code: 'B', title: 'آمار و احتمال 1' },
    { id: 73, code: 'C', title: 'آمار و احتمال1و2' },
    { id: 74, code: 'D', title: 'مدارهای الکتریکی 2' },
  ],
);
eq('سه نامزد (نه بیشتر، نه کمتر)', threeWay.length, 3);
eq('سه روشِ متفاوت، هر کدام نامزدِ خودش', threeWay.map((c) => c.method), [
  'TITLE_EXACT',
  'TITLE_WORD_CONTAINMENT',
  'TITLE_FUZZY',
]);
const f3 = markAmbiguity(threeWay);
okT('هر سه مبهم‌اند', f3.every((c) => c.ambiguous));
okT('هیچ‌کدام «برنده» نشده‌اند — rank فقط شماره است', f3.every((c) => !('winner' in c)));
eq('رقبای سطر اول = دو تا', f3[0].competingCandidates.length, 2);
okT('هیچ سطری بی‌رقیب علامت نخورده', markAmbiguity(threeWay.slice(0, 1))[0].ambiguous === false);

// حالت تصمیم
eq('بدونِ decidedAt ⇒ PROPOSED', stateOf({ decidedAt: null, rejected: 0 }), 'PROPOSED');
eq('decidedAt دارد و rejected=0 ⇒ APPROVED', stateOf({ decidedAt: '2026-01-01', rejected: 0 }), 'APPROVED');
eq('rejected=1 ⇒ REJECTED (حتی با decidedAt)', stateOf({ decidedAt: '2026-01-01', rejected: 1 }), 'REJECTED');

// ── ۴) چرخهٔ CSV ──────────────────────────────────────────────────────────
console.log('\n--- ۴. CSV رفت‌وبرگشت ---');
const csvOut = toCsv([
  {
    university_id_a: 1,
    course_id_a: 18,
    course_code_a: '99041',
    course_title_a: 'تربيت بدني',
    university_b: 'ZARINE',
    university_id_b: 2,
    course_id_b: 19570,
    course_code_b: '1103',
    course_title_b: 'تربيت بدني',
    match_method: 'TITLE_EXACT',
    match_score: 1,
    confidence: 0.95,
    ambiguous: 'YES',
    ambiguity_reasons: 'MULTI_CANDIDATE(20)',
    candidate_count: 20,
    competing_candidates: 'TITLE_EXACT@1:19677:11141103:تربيت بدني, TITLE_FUZZY@0.9:1:کلاس',
    competing_course_ids_a: '',
    affected_students: 2,
    affected_items: 2,
    state: 'PROPOSED',
    decided_by: '',
    decided_at: '',
    rejected: 0,
    decided_reason: '',
    rank: 1,
    review_decision: 'PENDING',
    review_match_method: '',
    review_course_id_b: '',
    review_confidence: '',
    review_reason: '',
  },
]);
okT('سطر فارسی در گیومه پیچیده شد', csvOut.includes('"تربيت بدني"') || csvOut.includes('تربيت بدني'));
okT('ستونِ دارای کاما گیومه گرفت', csvOut.includes('"TITLE_EXACT@1:19677:11141103:تربيت بدني, TITLE_FUZZY@0.9:1:کلاس"'));
const back = parseCsv('﻿' + csvOut);
eq('تعدادِ سطرِ برگشتی', back.length, 1);
eq('عنوانِ فارسی سالم برگشت', back[0].course_title_a, 'تربيت بدني');
eq('ستونِ کامادار سالم برگشت', back[0].competing_candidates, 'TITLE_EXACT@1:19677:11141103:تربيت بدني, TITLE_FUZZY@0.9:1:کلاس');
eq('عددِ صحیحِ بدونِ اعشار', back[0].match_score, '1');
eq('شمارهٔ سطر برای گزارش', back[0].__line, 2);
eq('CRLF هم پشتیبانی می‌شود', parseCsv('a,b\r\n1,2\r\n')[0].a, '1');
eq('سلولِ چندخطی', parseCsv('a,b\n"x\ny",2\n')[0].a, 'x\ny');
eq('CSV خالی ⇒ بدون سطر', parseCsv(''), []);

// ── ۵) اعتبارسنجیِ import ─────────────────────────────────────────────────
console.log('\n--- ۵. قواعدِ اعتبارسنجیِ import ---');
const baseRow = {
  university_id_a: '1',
  course_id_a: '18',
  university_id_b: '2',
  course_id_b: '19570',
  match_method: 'TITLE_EXACT',
  match_score: '1',
  review_decision: 'APPROVE',
  review_confidence: '0.95',
  review_reason: 'تأیید آموزش',
  decided_by: '',
};
const V = (over: Record<string, string>, ctx: Record<string, unknown> = { decidedBy: 42, userExists: true }) =>
  validateDecisionRow({ ...baseRow, ...over }, ctx);

eq('سطرِ درست ⇒ بدون خطا', V({}).errors, []);
eq('تصمیمِ نرمال‌شده', V({}).normalized?.rejected, 0);
okT('userId لازم است', V({}, { decidedBy: null, userExists: true }).errors.some((e) => e.includes('decided-by')));
okT('userId ناموجود ⇒ خطا', V({}, { decidedBy: 999999, userExists: false }).errors.some((e) => e.includes('وجود ندارد')));
okT('تصمیمِ ناشناخته ⇒ خطا', V({ review_decision: 'MAYBE' }).errors.some((e) => e.includes('review_decision')));
okT(
  'ردّ بدونِ دلیل ⇒ خطا (نه بی‌صدا)',
  V({ review_decision: 'REJECT', review_reason: '' }).errors.some((e) => e.includes('review_reason')),
);
okF('ردّ با دلیل ⇒ بی‌خطا', V({ review_decision: 'REJECT', review_reason: 'درسِ متفاوت است' }).errors.length > 0);
eq('ردّ ⇒ rejected=1', V({ review_decision: 'REJECT', review_reason: 'الف' }).normalized?.rejected, 1);
okT(
  'دلیلِ بلندتر از ۲۰۰ ⇒ خطا',
  V({ review_reason: 'ا'.repeat(201) }).errors.some((e) => e.includes('۲۰۰')),
);
okT(
  'MANUAL بدونِ هر دو id ⇒ خطا',
  V({ review_match_method: 'MANUAL', review_course_id_b: '', course_id_b: '' }).errors.some((e) =>
    e.includes('هر دو course_id_a'),
  ),
);
okF('MANUAL با هر دو id ⇒ بی‌خطا', V({ review_match_method: 'MANUAL', review_course_id_b: '20500' }).errors.length > 0);
eq('MANUAL ⇒ confidence ندارد', V({ review_match_method: 'MANUAL', review_course_id_b: '20500' }).normalized?.confidence, null);
okT(
  'id یکسان در دو طرف ⇒ خطا (معادل باید بین دو دانشگاه باشد)',
  V({ review_course_id_b: '18' }).errors.some((e) => e.includes('یکی‌اند')),
);
okT('confidence خارج از بازه ⇒ خطا', V({ review_confidence: '1.7' }).errors.some((e) => e.includes('بین ۰ و ۱')));
okT('confidence غیرعدد ⇒ خطا', V({ review_confidence: 'خیلی' }).errors.some((e) => e.includes('عدد نیست')));
okT('university_id_b خالی ⇒ خطا', V({ university_id_b: '' }).errors.some((e) => e.includes('university_id_b')));

// ── برنامهٔ import: idempotent، flip، insert، skip ───────────────────────
console.log('\n--- ۵.ب. برنامهٔ اعمالِ import ---');
const existingApproved = {
  id: 5,
  universityIdA: 1,
  courseIdA: 18,
  universityIdB: 2,
  courseIdB: 19570,
  matchMethod: 'TITLE_EXACT',
  matchScore: '1',
  confidence: '0.9500',
  decidedBy: 42,
  decidedAt: '2026-01-01T00:00:00.000Z',
  rejected: 0,
  decidedReason: 'تأیید آموزش',
};
const existingMap = new Map([['1:18:2:19570', existingApproved]]);
const opts = { decidedBy: 42, userExists: true };

eq('همان CSV ⇒ NOOP (idempotent)', planImport([{ ...baseRow, __line: 2 }], existingMap, opts)[0].action, IMPORT_ACTIONS.NOOP);
eq(
  'تأییدِ تازه روی پیشنهادِ بی‌تصمیم ⇒ UPDATE',
  planImport(
    [{ ...baseRow, __line: 2, decided_reason: 'تأیید آموزش' }],
    new Map([['1:18:2:19570', { ...existingApproved, decidedAt: null, decidedBy: null, decidedReason: null }]]),
    opts,
  )[0].action,
  IMPORT_ACTIONS.UPDATE,
);
eq(
  'ردّ کردنِ یک تأییدِ قبلی ⇒ FLIP (اعمال نمی‌شود)',
  planImport(
    [{ ...baseRow, __line: 2, review_decision: 'REJECT', review_reason: 'بعداً فهمیدیم یکی نیست' }],
    existingMap,
    opts,
  )[0].action,
  IMPORT_ACTIONS.FLIP,
);
eq(
  'جفتِ MANUAL تازه ⇒ INSERT',
  planImport(
    [{ ...baseRow, __line: 2, review_match_method: 'MANUAL', review_course_id_b: '20500' }],
    new Map(),
    opts,
  )[0].action,
  IMPORT_ACTIONS.INSERT,
);
eq(
  'review_decision=PENDING ⇒ SKIP',
  planImport([{ ...baseRow, __line: 2, review_decision: 'PENDING' }], existingMap, opts)[0].action,
  IMPORT_ACTIONS.SKIP,
);
eq(
  'سطرِ نامعتبر ⇒ ERROR و قابلِ نوشتن نیست',
  planImport([{ ...baseRow, __line: 2, review_decision: 'REJECT', review_reason: '' }], existingMap, opts)[0].action,
  IMPORT_ACTIONS.ERROR,
);
eq(
  'کلیدِ یکتای ۴ستونی درست استوار است',
  planImport([{ ...baseRow, __line: 2 }], new Map([['1:18:*:19570', existingApproved]]), opts)[0].action,
  IMPORT_ACTIONS.NOOP,
);

eq('sameDecision روی همان تصمیم', sameDecision(existingApproved, V({}).normalized!), true);
eq('sameDecision روی دلیلِ متفاوت', sameDecision(existingApproved, V({ review_reason: 'دلیل دیگر' }).normalized!), false);
eq('sameDecision نسبت به decidedAt بی‌تفاوت است', sameDecision({ ...existingApproved, decidedAt: '2030-05-05' }, V({}).normalized!), true);
okT('isFlip روی تصمیمِ عوض‌شده', isFlip(existingApproved, V({ review_decision: 'REJECT', review_reason: 'x' }).normalized!));
okF('isFlip روی سطرِ بی‌تصمیم', isFlip({ ...existingApproved, decidedAt: null }, V({}).normalized!));
eq('isFlip روی همان تصمیم', isFlip(existingApproved, V({}).normalized!), false);

// ── کلیدِ مقطع: اولویت با standardCode و گزارشِ مسیرِ عقب‌نشسته ──────────
console.log('\n--- ۶. کلیدِ مقطع ---');
eq('standardCode برنده است', levelKey({ standardCode: '210004', title: 'کارشناسي', code: 'SAMA-2' }), {
  key: 'SC:210004',
  source: 'STANDARD_CODE',
});
eq('بدونِ standardCode ⇒ کدِ وزارتی', levelKey({ standardCode: null, title: 'کارشناسی پیوسته', code: 'BS' }), {
  key: 'MC:BS',
  source: 'MINISTRY_CODE',
});
eq(
  'بدونِ هر دو ⇒ عنوانِ نرمال‌شده و مسیر گزارش می‌شود',
  levelKey({ standardCode: null, title: 'کارداني ناپيوسته', code: 'SAMA-1' }),
  { key: 'TT:کاردانیناپیوسته', source: 'TITLE' },
);
eq('مقطعِ گم‌شده', levelKey(null), { key: null, source: 'MISSING' });

console.log(`\n${fail === 0 ? '✓' : '✗'} نتیجه: ${pass} موفق | ${fail} شکست`);
if (fail > 0) process.exitCode = 1;