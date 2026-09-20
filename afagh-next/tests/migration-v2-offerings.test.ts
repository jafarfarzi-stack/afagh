/**
 * ══════════════════════════════════════════════════════════════════════
 *  تست‌های واحد Migration V2:
 *  ۱. اعتبارسنجی و تبدیل ارقام و روزهای هفته (سما و فارسی)
 *  ۲. تجزیه ساعت‌ها و بازه‌های زمانی (سما و متن آزاد)
 *  ۳. تشخیص توالی هفتگی (عادی/زوج/فرد) و اسلات‌های سما
 *  ۴. تجزیه رشته‌های مرکب برنامه کلاسی هفتگی
 *  ۵. تجزیه و اعتبارسنجی ردیف‌های ارائه‌های درسی (Course Offerings)
 *  ۶. پشتیبانی از نامک‌های ستون‌ها، ظرفیت‌ها، محدودیت‌های جنسیت و تاریخ آزمون
 * ══════════════════════════════════════════════════════════════════════
 */

import {
  cleanPersianDigits,
  parsePersianDayOfWeek,
  dayOfWeekToPersian,
  samaDayCodeToDayOfWeek,
  parseTimeString,
  parseTimeRange,
  parseWeekParity,
  parseSamaScheduleSlot,
  parseScheduleString,
} from '../scripts/migration-v2/offerings/schedule-parser.mjs';

import {
  parseOfferingRow,
  normalizeGenderRestriction,
  normalizeOfferingType,
} from '../scripts/migration-v2/offerings/offering-parser.mjs';

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

const okTrue = (name: string, val: unknown) => eq(name, Boolean(val), true);
const okFalse = (name: string, val: unknown) => eq(name, Boolean(val), false);

console.log('\n--- ۱. تست‌های تبدیل ارقام و روزهای هفته (فارسی و سما) ---');

eq('تبدیل ارقام فارسی', cleanPersianDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
eq('تبدیل ارقام عربی', cleanPersianDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');

eq('روز شنبه', parsePersianDayOfWeek('شنبه'), 1);
eq('روز یکشنبه', parsePersianDayOfWeek('یکشنبه'), 2);
eq('روز یک‌شنبه با نیم‌فاصله', parsePersianDayOfWeek('یک‌شنبه'), 2);
eq('روز دوشنبه', parsePersianDayOfWeek('دوشنبه'), 3);
eq('روز سه‌شنبه', parsePersianDayOfWeek('سه‌شنبه'), 4);
eq('روز چهارشنبه', parsePersianDayOfWeek('چهارشنبه'), 5);
eq('روز پنج‌شنبه', parsePersianDayOfWeek('پنج‌شنبه'), 6);
eq('روز جمعه', parsePersianDayOfWeek('جمعه'), 7);
eq('روز آدینه', parsePersianDayOfWeek('آدینه'), 7);
eq('روز نامعتبر', parsePersianDayOfWeek('نامعلوم'), null);

eq('عنوان فارسی روز ۱', dayOfWeekToPersian(1), 'شنبه');
eq('عنوان فارسی روز ۶', dayOfWeekToPersian(6), 'پنج‌شنبه');
eq('عنوان فارسی روز ۷', dayOfWeekToPersian(7), 'جمعه');

eq('کد روز سما 0 -> شنبه (1)', samaDayCodeToDayOfWeek(0), 1);
eq('کد روز سما 1 -> یکشنبه (2)', samaDayCodeToDayOfWeek(1), 2);
eq('کد روز سما 4 -> چهارشنبه (5)', samaDayCodeToDayOfWeek(4), 5);
eq('کد روز سما 5 -> پنجشنبه (6)', samaDayCodeToDayOfWeek(5), 6);
eq('کد روز سما 6 -> جمعه (7)', samaDayCodeToDayOfWeek(6), 7);
eq('کد روز سما -1 -> null', samaDayCodeToDayOfWeek(-1), null);

console.log('\n--- ۲. تست‌های تجزیه زمان و بازه‌های ساعتی ---');

eq('ساعت سما 800 -> 08:00:00', parseTimeString('800'), '08:00:00');
eq('ساعت سما 930 -> 09:30:00', parseTimeString('930'), '09:30:00');
eq('ساعت سما 1130 -> 11:30:00', parseTimeString('1130'), '11:30:00');
eq('ساعت سما 1400 -> 14:00:00', parseTimeString('1400'), '14:00:00');
eq('ساعت سما 1715 -> 17:15:00', parseTimeString('1715'), '17:15:00');
eq('ساعت با دو نقطه 8:30', parseTimeString('8:30'), '08:30:00');
eq('ساعت با ارقام فارسی ۰۸:۰۰', parseTimeString('۰۸:۰۰'), '08:00:00');
eq('ساعت تک‌رقمی 8', parseTimeString('8'), '08:00:00');
eq('ساعت صفر سما -> null', parseTimeString('0'), null);
eq('ساعت منفی یک سما -> null', parseTimeString('-1'), null);

const r1 = parseTimeRange('08:00 - 10:00');
eq('بازه 08:00 - 10:00 شروع', r1?.startTime, '08:00:00');
eq('بازه 08:00 - 10:00 پایان', r1?.endTime, '10:00:00');

const r2 = parseTimeRange('8 الی 9:30');
eq('بازه با الی شروع', r2?.startTime, '08:00:00');
eq('بازه با الی پایان', r2?.endTime, '09:30:00');

const r3 = parseTimeRange('۱۴:۰۰ تا ۱۵:۳۰');
eq('بازه با ارقام فارسی شروع', r3?.startTime, '14:00:00');
eq('بازه با ارقام فارسی پایان', r3?.endTime, '15:30:00');

console.log('\n--- ۳. تست‌های توالی هفتگی و اسلات سما ---');

eq('توالی سما 1 -> CLASS', parseWeekParity('1'), 'CLASS');
eq('توالی سما 2 -> ODD', parseWeekParity('2'), 'ODD');
eq('توالی سما 3 -> EVEN', parseWeekParity('3'), 'EVEN');
eq('توالی هفته زوج', parseWeekParity('هفته‌های زوج'), 'EVEN');
eq('توالی هفته فرد', parseWeekParity('هفته فرد'), 'ODD');

const slotNormal = parseSamaScheduleSlot({
  dayCode: '0',
  startTime: '800',
  endTime: '930',
  placeCode: '101',
  weeklyCrossTypeID: '1',
});
eq('اسلات عادی شنبه', slotNormal.dayOfWeek, 1);
eq('اسلات عادی شروع', slotNormal.startTime, '08:00:00');
eq('اسلات عادی پایان', slotNormal.endTime, '09:30:00');
eq('اسلات عادی کلاس', slotNormal.roomCode, '101');
eq('اسلات عادی نوع', slotNormal.scheduleType, 'CLASS');
okTrue('اسلات عادی دارای برنامه', slotNormal.hasSchedule);

const slotEmpty = parseSamaScheduleSlot({
  dayCode: '-1',
  startTime: '0',
  endTime: '0',
  placeCode: '0',
  weeklyCrossTypeID: '1',
});
okFalse('اسلات بدون برنامه', slotEmpty.hasSchedule);
eq('اسلات بدون کلاس roomCode null', slotEmpty.roomCode, null);

console.log('\n--- ۴. تست‌های تجزیه متن آزاد برنامه هفتگی ---');

const freeText1 = 'شنبه ۰۸:۰۰ - ۱۰:۰۰ (کلاس ۱۰۱) / دوشنبه ۱۰:۰۰ - ۱۲:۰۰ (کلاس ۱۰۲)';
const parsedFree1 = parseScheduleString(freeText1);
eq('تعداد اسلات‌های متن مرکب', parsedFree1.length, 2);
eq('اسلات اول روز شنبه', parsedFree1[0].dayOfWeek, 1);
eq('اسلات اول شروع', parsedFree1[0].startTime, '08:00:00');
eq('اسلات اول کلاس ۱۰۱', parsedFree1[0].roomHint, '101');
eq('اسلات دوم روز دوشنبه', parsedFree1[1].dayOfWeek, 3);
eq('اسلات دوم شروع', parsedFree1[1].startTime, '10:00:00');
eq('اسلات دوم کلاس ۱۰۲', parsedFree1[1].roomHint, '102');

const freeText2 = 'چهارشنبه 14:00 الی 15:30 هفته زوج سالن همایش';
const parsedFree2 = parseScheduleString(freeText2);
eq('تعداد اسلات زوج', parsedFree2.length, 1);
eq('روز چهارشنبه', parsedFree2[0].dayOfWeek, 5);
eq('نوع هفته زوج', parsedFree2[0].scheduleType, 'EVEN');

console.log('\n--- ۵. تست‌های تفکیک جنسیت و نوع ارائه ---');

eq('جنسیت برادران -> MALE', normalizeGenderRestriction('برادران'), 'MALE');
eq('جنسیت پسر -> MALE', normalizeGenderRestriction('پسر'), 'MALE');
eq('جنسیت خواهران -> FEMALE', normalizeGenderRestriction('خواهران'), 'FEMALE');
eq('جنسیت دختر -> FEMALE', normalizeGenderRestriction('دختر'), 'FEMALE');
eq('جنسیت مختلط -> MIXED', normalizeGenderRestriction('مختلط'), 'MIXED');
eq('جنسیت خالی -> MIXED', normalizeGenderRestriction(''), 'MIXED');

eq('نوع ارائه عادی -> NORMAL', normalizeOfferingType('عادی'), 'NORMAL');
eq('نوع ارائه تابستان -> SUMMER', normalizeOfferingType('تابستان'), 'SUMMER');
eq('نوع ارائه انتقال -> TRANSFER', normalizeOfferingType('انتقالی'), 'TRANSFER');
eq('نوع ارائه مجازی -> VIRTUAL', normalizeOfferingType('مجازی'), 'VIRTUAL');

console.log('\n--- ۶. تست‌های تجزیه ردیف‌های ارائه‌های درسی (Course Offerings) ---');

// ردیف کامل و معتبر
const rowValid = {
  'کد ترم': '14011',
  'کد درس': '12012',
  'نام درس': 'ریاضی ۱',
  'گروه': '۲',
  'ظرفیت': '۳۵',
  'کد استاد': '8614',
  'نام استاد': 'دکتر احمدی',
  'برنامه هفتگی': 'شنبه ۰۸:۰۰ - ۱۰:۰۰',
  'کلاس': '201',
  'جنسیت': 'مختلط',
};

const resValid = parseOfferingRow(rowValid);
okTrue('پارس ردیف معتبر ok', resValid.ok);
if (resValid.ok) {
  eq('کد ترم نرمال شده', resValid.row.canonicalTermCode, '14011');
  eq('کد درس', resValid.row.courseCode, '12012');
  eq('شماره گروه ۲', resValid.row.groupNumber, 2);
  eq('ظرفیت ۳۵', resValid.row.capacity, 35);
  eq('کد استاد', resValid.row.professorCode, '8614');
  eq('محدودیت جنسیت', resValid.row.genderRestriction, 'MIXED');
  eq('تعداد اسلات برنامه هفتگی', resValid.row.schedules.length, 1);
  eq('روز اسلات شنبه', resValid.row.schedules[0].dayOfWeek, 1);
}

// ردیف ۳ رقمی ترم (زرینه 871 -> 13871)
const rowZarrineh = {
  'term_code': '871',
  'course_code': '99001',
  'group': '1',
};
const resZarrineh = parseOfferingRow(rowZarrineh);
okTrue('پارس ردیف زرینه ok', resZarrineh.ok);
if (resZarrineh.ok) {
  eq('ترم ۸۷۱ تبدیل به ۱۳۸۷۱', resZarrineh.row.canonicalTermCode, '13871');
  eq('ظرفیت پیش‌فرض ۴۰', resZarrineh.row.capacity, 40);
  eq('کد استاد بدون مقدار null', resZarrineh.row.professorCode, null);
}

// ردیف ترم تابستان (خودکار SUMMER می‌شود)
const rowSummer = {
  'کد ترم': '14013',
  'کد درس': '11005',
};
const resSummer = parseOfferingRow(rowSummer);
okTrue('پارس ترم تابستان ok', resSummer.ok);
if (resSummer.ok) {
  eq('نوع ارائه ترم ۳ خودکار SUMMER', resSummer.row.offeringType, 'SUMMER');
}

// ردیف‌های نامعتبر
const rowNoTerm = { 'کد درس': '12012' };
const resNoTerm = parseOfferingRow(rowNoTerm);
okFalse('ردیف بدون ترم باید رد شود', resNoTerm.ok);

const rowNoCourse = { 'کد ترم': '14011' };
const resNoCourse = parseOfferingRow(rowNoCourse);
okFalse('ردیف بدون درس باید رد شود', resNoCourse.ok);

console.log('\n========================================');
console.log(`نتیجه تست‌های ارائه و زمان‌بندی: ${pass} موفق | ${fail} شکست`);
console.log('========================================\n');

if (fail > 0) {
  process.exit(1);
}
