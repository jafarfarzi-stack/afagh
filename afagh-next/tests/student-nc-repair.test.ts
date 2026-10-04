/**
 * ════════════════════════════════════════════════════════════════════════
 *  تست واحد «ترمیم کد ملی» — منطق خالص scripts/lib/student-nc-repair.mjs
 *
 *  چهار بخش:
 *   ۱) نرمال‌سازی (ارقام فارسی/عربی، NUL، فاصلهٔ نیم‌عرض، حفظ صفر ابتدایی)
 *   ۲) تفکیک ستون فقط با نام هدر — و ردّ صریح IDNO و ردّ هدر خالی
 *   ۳) اعتبارسنجی mod-11 روی کدهای شناخته‌شدهٔ معتبر/نامعتبر
 *   ۴) ماتریس حکم‌ها (AUTO_FIX / ALREADY_CORRECT / NO_CHANGE / COLLISION / …)
 *      و تشخیص برخورد با کدهای موجود و با طرحِ خودِ اجرا
 * ════════════════════════════════════════════════════════════════════════
 */
import {
  normalizeDigits,
  hasVisibleNoise,
  resolveColumnsByHeader,
  classifyCurrent,
  classifySource,
  decideRepair,
  checkCollision,
  checkPlanCollision,
  isValidIranianNationalCode,
  SENTINEL_CODES,
  SOURCE_STATES,
  VERDICTS,
  UNIVERSITY_DATA_DIRS,
} from '../scripts/lib/student-nc-repair.mjs';

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

// ── ۱) نرمال‌سازی ────────────────────────────────────────────────────────
console.log('\n--- ۱. نرمال‌سازی مقدار منبع ---');
eq('ارقام فارسی → ASCII', normalizeDigits('۰۰۱۰۳۷۶۸۱۱'), '0010376811');
eq('ارقام عربی-هندی → ASCII', normalizeDigits('٠٠١٠٣٧٦٨١١'), '0010376811');
eq('حفظ صفر ابتدایی', normalizeDigits('0000000001'), '0000000001');
eq('حذف NUL', normalizeDigits('00\u00001037\u00006811'), '0010376811');
eq('حذف فاصلهٔ نیم‌عرض', normalizeDigits('00\u00A01037\u00A06811'), '0010376811');
eq('خالی', normalizeDigits(''), '');
eq('null', normalizeDigits(null), '');
eq('undefined', normalizeDigits(undefined), '');
eq('طول اشتباه ۹ رقم', normalizeDigits('123456789').length, 9);
okT('نویزِ دیدنی («123-456») تشخیص داده می‌شود', hasVisibleNoise('123-456'));
okF('صدای ۱۰ رقمی نویزِ دیدنی ندارد', hasVisibleNoise('0010376811'));
okF('فاصله نویزِ دیدنی نیست', hasVisibleNoise(' 0010376811 '));

// ── ۲) تفکیک ستون با نام هدر ─────────────────────────────────────────────
console.log('\n--- ۲. تفکیک ستون بر پایهٔ نام هدر (نه ایندکس ثابت) ---');
const zarineHeader = ['Stno', 'PriorReshteh', 'PriorMaghta', 'PriorUniv', 'PriorEDUDate', 'LogNumber', 'Bh5', 'Nationality', 'NationalCode', 'CurrentADDRESS'];
/** تفکیک موفق ⇒ ایندکس ستون کد ملی */
const ncIdx = (header: string[]): number => {
  const r = resolveColumnsByHeader(header);
  return r.ok ? r.nationalCodeIndex : -1;
};
/** کد دلیل ردّ (یا null اگر تفکیک موفق بوده) */
const rejectCode = (header: string[]): string | null => {
  const r = resolveColumnsByHeader(header);
  return r.ok ? null : r.code;
};
const rZarine = resolveColumnsByHeader(zarineHeader);
okT('زرینه: تفکیک موفق', rZarine.ok);
eq('زرینه: ایندکس کد ملی = ۸ (وگرنه اندیس ۷ می‌شد که Nationality است)', (rZarine.ok ? rZarine.nationalCodeIndex : -1), 8);
eq('زرینه: نام ستون', (rZarine.ok ? rZarine.nationalCodeName : ''), 'NationalCode');
eq('زرینه: ایندکس کلید الحاق', (rZarine.ok ? rZarine.stnoIndex : -1), 0);

const nazhandHeader = ['Stno', 'PriorReshteh', 'PriorMaghta', 'PriorUniv', 'PriorEDUDate', 'Bh5', 'Nationality', 'NationalCode', 'CurrentADDRESS'];
eq('نژند (بدون LogNumber): ایندکس کد ملی = ۷', ncIdx(nazhandHeader), 7);
eq('نام فارسی «کد ملی» پذیرفته می‌شود', ncIdx(['Stno', 'کد ملی']), 1);
eq('نام فارسی «کدملی» (بدون فاصله) پذیرفته می‌شود', ncIdx(['Stno', 'کدملی']), 1);
eq('حساس به بزرگی/کوچکی حروف نیست', ncIdx(['stno', 'NATIONALCODE']), 1);

const idnoOnly = resolveColumnsByHeader(['Stno', 'Bh5', 'Nationality', 'IDNO', 'Shenasname']);
okF('ستون IDNO تنها ⇒ ردّ صریح', idnoOnly.ok);
eq('دلیل ردّ IDNO', (idnoOnly.ok ? '' : idnoOnly.code), 'REFUSED_IDNO');
const idnoPlus = resolveColumnsByHeader(['Stno', 'IDNO', 'NationalCode']);
eq('وقتی NationalCode هم هست، IDNO نادیده گرفته و گزارش می‌شود', ncIdx(['Stno', 'IDNO', 'NationalCode']), 2);
eq('…و IDNO در فهرست نادیده‌گرفته‌شده‌ها می‌آید', (idnoPlus.ok ? idnoPlus.ignoredColumns : []), ['IDNO']);
okT('هدر تماماً خالی ⇒ ردّ (آفاق)', !resolveColumnsByHeader(new Array(93).fill(' ')).ok);
eq('دلیل ردّ هدر خالی', rejectCode(new Array(93).fill(' ')), 'BLANK_HEADER_ROW');
eq('هدر خالیِ کاملاً تهی', rejectCode([]), 'EMPTY_HEADER');
eq('دو ستون کد ملی ⇒ مبهم', rejectCode(['Stno', 'NationalCode', 'کد ملی']), 'AMBIGUOUS_NC_COLUMN');
eq('بدون Stno ⇒ ردّ', rejectCode(['X', 'NationalCode']), 'NO_STNO_COLUMN');

// ── ۳) اعتبارسنجی mod-11 ─────────────────────────────────────────────────
console.log('\n--- ۳. اعتبارسنجی mod-11 ---');
okT('مرجع مخزن: 0010376811', isValidIranianNationalCode('0010376811'));
okT('مرجع مخزن: 0499370899', isValidIranianNationalCode('0499370899'));
okT('مرجع مخزن: 1270384211', isValidIranianNationalCode('1270384211'));
okT('واقعی از زرینه: 0383744024', isValidIranianNationalCode('0383744024'));
okT('واقعی از زرینه: 4939546942', isValidIranianNationalCode('4939546942'));
okT('واقعی از شمس: 2802917961', isValidIranianNationalCode('2802917961'));
okF('رقم کنترل غلط', isValidIranianNationalCode('0010376812'));
okF('۹ رقم', isValidIranianNationalCode('001037681'));
okF('۱۱ رقم', isValidIranianNationalCode('00103768111'));
okF('خالی', isValidIranianNationalCode(''));
okF('null', isValidIranianNationalCode(null));
okF('undefined', isValidIranianNationalCode(undefined));
okF('غیر رشته (عدد)', isValidIranianNationalCode(10376811 as unknown as string));
for (const s of SENTINEL_CODES) okF(`بنچمارک ${s} رد می‌شود`, isValidIranianNationalCode(s));
okF('ارقام یکسان ۹۹۹…', isValidIranianNationalCode('9999999999'));
// خاصیت: رقم کنترلِ درست همیشه پذیرفته و دستکاری‌شده همیشه رد می‌شود
let propOk = 0;
let propBad = 0;
for (let i = 0; i < 5000; i++) {
  const nine = String(i * 7919 + 100000000).slice(0, 9);
  let sum = 0;
  for (let k = 0; k < 9; k++) sum += Number(nine[k]) * (10 - k);
  const r = sum % 11;
  const good = nine + String(r < 2 ? r : 11 - r);
  const bad = nine + String((Number(good[9]) + 1) % 10);
  if (isValidIranianNationalCode(good)) propOk++;
  if (!isValidIranianNationalCode(bad)) propBad++;
}
eq('۵۰۰۰ کد با رقم کنترلِ درست پذیرفته شدند', propOk, 5000);
eq('۵۰۰۰ کد با رقم کنترلِ دستکاری‌شده رد شدند', propBad, 5000);

// ── ۴) ماتریس حکم‌ها ─────────────────────────────────────────────────────
console.log('\n--- ۴. ماتریس حکم‌ها ---');
const src = (v: string | null, ctx = {}) => classifySource(v, { hasRow: v !== null, hasColumn: true, ...ctx });
const cur = (c: string | null, b: string | null = null) => classifyCurrent(c, b);
const decide = (currentCode: string | null, sourceValue: string | null, opts: Partial<Parameters<typeof decideRepair>[0]> = {}, bc: string | null = null) =>
  decideRepair({ current: cur(currentCode, bc), currentCode: currentCode ?? '', source: src(sourceValue), ...opts });

eq('کدِ معتبرِ منبع برابرِ مقدار فعلی ⇒ ALREADY_CORRECT', decide('0010376811', '0010376811').verdict, VERDICTS.ALREADY_CORRECT);
eq('کدِ معتبرِ منبع جای کدِ مصنوعی ⇒ AUTO_FIX', decide('SZ0000123', '0010376811').verdict, VERDICTS.AUTO_FIX);
okT('AUTO_FIX واقعاً promote می‌شود', decide('SZ0000123', '0010376811').promote);
eq('کدِ فعلی معتبر ولی منبع متفاوت ⇒ CONFLICT_WITH_DB (هرگز بازنویسی نمی‌شود)', decide('0010376811', '0499370899').verdict, VERDICTS.CONFLICT_WITH_DB);
okF('CONFLICT_WITH_DB ارتقا نمی‌رود', decide('0010376811', '0499370899').promote);
eq('کدِ فعلی معتبر، منبع خالی ⇒ NO_CHANGE', decide('0010376811', '').verdict, VERDICTS.NO_CHANGE);
eq('کدِ فعلی معتبر، منبع ناموجود ⇒ NO_CHANGE', decide('0010376811', null).verdict, VERDICTS.NO_CHANGE);
eq('بدون سطر در فایل ⇒ SOURCE_MISSING', decide('SZ0000123', null).verdict, VERDICTS.SOURCE_MISSING);
eq('سلول خالی ⇒ SOURCE_EMPTY', decide('SZ0000123', '').verdict, VERDICTS.SOURCE_EMPTY);
eq('طول اشتباه ⇒ SOURCE_MALFORMED', decide('SZ0000123', '08100754962').verdict, VERDICTS.SOURCE_MALFORMED);
eq('نویزِ دیدنی ⇒ SOURCE_MALFORMED (نه چسباندن ارقام)', decide('SZ0000123', '081-00754-962').verdict, VERDICTS.SOURCE_MALFORMED);
eq('چک‌سام غلط ⇒ SOURCE_INVALID_CHECKSUM', decide('SZ0000123', '0915214529').verdict, VERDICTS.SOURCE_INVALID_CHECKSUM);
eq('بنچمارک ۱۱۱… ⇒ SOURCE_SENTINEL', decide('SZ0000123', '1111111111').verdict, VERDICTS.SOURCE_SENTINEL);
eq('بنچمارکِ نوشته‌شده با ارقام فارسی هم بنچمارک است', decide('SZ0000123', '۱۲۳۴۵۶۷۸۹۰').verdict, VERDICTS.SOURCE_SENTINEL);
eq('ارقام فارسیِ معتبر نرمال و پذیرفته می‌شود', decide('SZ0000123', '۰۰۱۰۳۷۶۸۱۱').verdict, VERDICTS.AUTO_FIX);
eq('Stno تکراری با مقدار متعارض ⇒ SOURCE_AMBIGUOUS', src('0010376811', { conflict: true }).state, SOURCE_STATES.AMBIGUOUS);
eq('…و حکمِ نهایی‌اش SOURCE_AMBIGUOUS است', decide('SZ0000123', '0010376811', { source: src('0010376811', { conflict: true }) }).verdict, VERDICTS.SOURCE_AMBIGUOUS);
eq('دو کدِ معتبرِ متفاوت ⇒ AMBIGUOUS_SOURCE', decide('SZ0000123', '0010376811', { ambiguous: true }).verdict, VERDICTS.AMBIGUOUS_SOURCE);
okF('AMBIGUOUS_SOURCE ارتقا نمی‌رود', decide('SZ0000123', '0010376811', { ambiguous: true }).promote);
eq('برخورد با کاربر دیگر ⇒ COLLISION', decide('SZ0000123', '0010376811', { collidesWithOtherUser: true, collisionUserId: 4242 }).verdict, VERDICTS.COLLISION);
okF('COLLISION ارتقا نمی‌رود', decide('SZ0000123', '0010376811', { collidesWithOtherUser: true }).promote);

// ── آلودگی با شمارهٔ شناسنامه ────────────────────────────────────────────
console.log('\n--- ۵. آلودگی nationalCode با birthCertNo ---');
const leaked = cur('3036', '3036');
eq('کلاس مقدار فعلی', leaked.klass, 'EQUALS_BIRTH_CERT|NOT_10_DIGITS');
okT('پرچم برابری با شناسنامه', leaked.equalsBirthCertNo);
okT('پرچم غیر۱۰رقمی', leaked.notTenDigits);
okF('معتبر محسوب نمی‌شود', leaked.valid);
eq('اگر منبع کدِ معتبر بدهد ⇒ AUTO_FIX', decide('3036', '0010376811', {}, '3036').verdict, VERDICTS.AUTO_FIX);
eq('بدون منبع، دست‌نخورده می‌ماند', decide('3036', null, {}, '3036').verdict, VERDICTS.SOURCE_MISSING);
eq('کدِ ۱۰رقمی با چک‌سام غلط', cur('0010376812').klass, 'CHECKSUM_INVALID');
eq('کدِ مصنوعی سما', cur('SZ00031028').klass, 'SYNTHETIC_PLACEHOLDER|NOT_10_DIGITS');
eq('کدِ سالم', cur('0010376811').klass, 'VALID');

// ── ۶) برخورد ───────────────────────────────────────────────────────────
console.log('\n--- ۶. تشخیص برخورد ---');
const owners = new Map([
  ['0010376811', 10],
  ['0499370899', 20],
]);
eq('کدِ آزاد ⇒ بدون برخورد', checkCollision(owners, 99, '1270384211').collides, false);
eq('کدِ مالکِ خودِ کاربر ⇒ بدون برخورد', checkCollision(owners, 10, '0010376811').collides, false);
eq('کدِ کاربرِ دیگر ⇒ برخورد', checkCollision(owners, 99, '0010376811').collides, true);
eq('شمارهٔ صاحبِ برخورد', checkCollision(owners, 99, '0010376811').withUserId, 10);
eq('بدون کد پیشنهادی ⇒ بدون برخورد', checkCollision(owners, 99, null).collides, false);
const planOwners = new Map([['1270384211', 5]]);
eq('دو سطرِ طرح که یک کد می‌خواهند ⇒ برخورد', checkPlanCollision(planOwners, 6, '1270384211').collides, true);
eq('صاحبِ اولی کد برنده است', checkPlanCollision(planOwners, 5, '1270384211').collides, false);

// ── ۷) نگاشت پوشهٔ داده ──────────────────────────────────────────────────
console.log('\n--- ۷. نگاشت صریح دانشگاه → پوشهٔ داده ---');
eq('همه نگاشت‌ها', { ...UNIVERSITY_DATA_DIRS }, {
  AFAGH: 'information-afagh',
  ZARINE: 'information-zarine',
  ALLAME: 'information-allameh',
  SHAMS: 'information-shams',
  NAZHAND: 'information-nazhand',
});

console.log(`\n${fail === 0 ? '✓' : '✗'} نتیجه: ${pass} موفق | ${fail} شکست`);
if (fail > 0) process.exitCode = 1;