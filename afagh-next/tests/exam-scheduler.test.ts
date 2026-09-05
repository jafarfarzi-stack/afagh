/**
 * تست واحد هستهٔ خالص برنامه‌ریزی امتحانات (فاز ۹ و ۱۰) — بدون React و بدون DB
 *
 * اجرا: npm test  (بخش exam-scheduler)
 * پوشش: زون‌بندی (قوانین ۱–۳)، تشخیص تداخل سخت/نرم، گلوگاه ظرفیت و تجزیهٔ
 * امتحان، امتیازدهی هوشمند شیفتِ عصر، تخصیص قطعی صندلی/بلوک.
 */
import {
  allowedExamRange, detectExamConflicts, examKindOf, examLevelOf, isAfternoonSlot,
  normJalali, planSeatAllocation, scoreExamSlot, slotAllowedInZone, validateAndSplitExam,
  validateZoning, type ExamZoning,
} from '../src/lib/exam-scheduler.ts';

let pass = 0;
let fail = 0;
function t(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

const ZONE: ExamZoning = {
  globalStart: '1405/03/20', globalEnd: '1405/04/10',
  generalStart: '1405/03/20', generalEnd: '1405/03/26',
  specializedStart: '1405/03/27', specializedEnd: '1405/04/10',
};

console.log('— فاز ۹: زون‌بندی تقویم امتحانات —');
t('مقطع ارشد → POSTGRADUATE', examLevelOf('کارشناسی ارشد') === 'POSTGRADUATE');
t('مقطع دکتری → POSTGRADUATE', examLevelOf('دکتری تخصصی') === 'POSTGRADUATE');
t('مقطع کارشناسی → UNDERGRADUATE', examLevelOf('کارشناسی پیوسته') === 'UNDERGRADUATE');
t('مقطع نامشخص → UNDERGRADUATE', examLevelOf(null) === 'UNDERGRADUATE');
t('درس عمومی → GENERAL_SHARED', examKindOf('عمومی') === 'GENERAL_SHARED');
t('درس معارف → GENERAL_SHARED', examKindOf('معارف اسلامی') === 'GENERAL_SHARED');
t('درس علوم پایه → GENERAL_SHARED', examKindOf('علوم پایه') === 'GENERAL_SHARED');
t('درس تخصصی → SPECIALIZED', examKindOf('تخصصی') === 'SPECIALIZED');

t('قانون ۱: ارشد در کل بازهٔ ۳ هفته', allowedExamRange(ZONE, 'POSTGRADUATE', 'SPECIALIZED').allowedStart === '1405/03/20');
t('قانون ۲: عمومی فقط هفتهٔ اول', allowedExamRange(ZONE, 'UNDERGRADUATE', 'GENERAL_SHARED').allowedEnd === '1405/03/26');
t('قانون ۳: تخصصی هفتهٔ ۲ و ۳', allowedExamRange(ZONE, 'UNDERGRADUATE', 'SPECIALIZED').allowedStart === '1405/03/27');
t('ارشد در هفتهٔ اول مجاز است', slotAllowedInZone(ZONE, 'POSTGRADUATE', 'SPECIALIZED', '1405/03/22'));
t('عمومی در هفتهٔ دوم مجاز نیست', !slotAllowedInZone(ZONE, 'UNDERGRADUATE', 'GENERAL_SHARED', '1405/03/28'));
t('تخصصی در هفتهٔ اول مجاز نیست', !slotAllowedInZone(ZONE, 'UNDERGRADUATE', 'SPECIALIZED', '1405/03/21'));
t('نرمال‌سازی تاریخ', normJalali('1405/3/5') === '1405/03/05');
t('اعتبارسنجی ترتیب بازه‌ها', validateZoning(ZONE).ok === true);
t('اعتبارسنجی ترتیب خراب → خطا', validateZoning({ ...ZONE, generalStart: '1405/04/01' }).ok === false);

console.log('— فاز ۹: تشخیص تداخل سخت/نرم —');
const rows = [
  { offeringId: 1, courseCode: 'ریاضی ۱', examDate: '1405/03/20', startTime: '08:00', endTime: '10:00' },
  { offeringId: 2, courseCode: 'ریاضی ۲', examDate: '1405/03/20', startTime: '08:00', endTime: '10:00' },
  { offeringId: 3, courseCode: 'فیزیک ۱', examDate: '1405/03/20', startTime: '14:00', endTime: '16:00' },
  { offeringId: 4, courseCode: 'فیزیک ۲', examDate: '1405/03/22', startTime: '08:00', endTime: '10:00' },
];
const det = detectExamConflicts(rows);
t('تداخل قطعی (همان روز + همان ساعت) تشخیص داده شد', det.hard.length === 1 && det.hard[0].courseA === 'ریاضی ۱' && det.hard[0].courseB === 'ریاضی ۲');
t('تداخل نرم (همان روز + ساعت متفاوت) تشخیص داده شد', det.soft.length === 2 && det.soft.every(c => c.examDate === '1405/03/20'));
t('درس بدون هم‌روز → بدون یافته', !det.hard.some(c => c.a === 4 || c.b === 4));
t('ساعت بعدازظهر', isAfternoonSlot('14:00') && !isAfternoonSlot('08:00'));

console.log('— فاز ۹: گلوگاه ظرفیت و تجزیهٔ امتحان —');
t('تقاضا ≤ ظرفیت → OK', validateAndSplitExam(50, 100).status === 'OK');
const over = validateAndSplitExam(600, 400);
t('سرریز ۶۰۰ در ۴۰۰ → OVERFLOW', over.status === 'OVERFLOW');
t('پیشنهاد تجزیهٔ ۲ شیفتی دارد', over.status === 'OVERFLOW' && over.splitOptions.some(o => o.shifts === 2 && o.seatsPerShift === 300));
t('پیشنهاد تجزیه حجم‌های مختلف دارد', over.status === 'OVERFLOW' && over.splitOptions.length >= 2);

console.log('— فاز ۹: امتیازدهی هوشمند شیفت —');
const scPost = scoreExamSlot({ level: 'POSTGRADUATE', isAfternoon: true, isWorkingClassMajority: false, hasEnoughCapacity: true });
t('ارشد + عصر → امتیاز ۵۰ با دلیل', scPost.ok && scPost.score === 50 && scPost.reasons.some(r => r.includes('عصر')));
const scWorker = scoreExamSlot({ level: 'UNDERGRADUATE', isAfternoon: true, isWorkingClassMajority: true, hasEnoughCapacity: true });
t('رشتهٔ شاغل‌محور + عصر → امتیاز ۴۰', scWorker.ok && scWorker.score === 40);
const scMorning = scoreExamSlot({ level: 'UNDERGRADUATE', isAfternoon: false, isWorkingClassMajority: false, hasEnoughCapacity: true });
t('صبح بدون اولویت → قابل قبول با امتیاز صفر', scMorning.ok && scMorning.score === 0);
const scFull = scoreExamSlot({ level: 'UNDERGRADUATE', isAfternoon: true, isWorkingClassMajority: false, hasEnoughCapacity: false });
t('ظرفیت ناکافی → حذف از پیشنهادها', !scFull.ok && scFull.reasons[0].includes('ظرفیت'));

console.log('— فاز ۱۰: تخصیص قطعی صندلی —');
const halls = [{ id: 10, capacity: 100 }, { id: 20, capacity: 50 }];
const entries = [
  { enrollmentId: 1, studentId: 30, offeringId: 7 },
  { enrollmentId: 2, studentId: 10, offeringId: 7 },
  { enrollmentId: 3, studentId: 20, offeringId: 8 },
];
const plan = planSeatAllocation(entries, halls);
t('همهٔ ۳ دانشجو صندلی گرفتند', plan.length === 3);
t('مرتب‌سازی قطعی: کوچک‌ترین studentId اول', plan[0].enrollmentId === 2);
t('سالن بزرگ‌تر اول پر می‌شود', plan[0].hallId === 10 && plan[1].hallId === 10);
const bigPlan = planSeatAllocation(
  Array.from({ length: 150 }, (_, i) => ({ enrollmentId: i + 1, studentId: i + 1, offeringId: 1 })),
  halls,
);
t('پس از پر شدن سالن ۱۰۰نفره، سالن ۵۰نفره', bigPlan[99].hallId === 10 && bigPlan[100].hallId === 20);
t('بلوک ۳۰تایی در سالن دوم (صندلی ۳۱ → B2)', bigPlan[130].blockKey === '20-B2');
t('شمارهٔ صندلی از ۱ شروع و متوالی است', plan[0].seatNumber === 1 && plan[1].seatNumber === 2);
t('blockKey بلوک ۳۰تایی دارد', plan[0].blockKey === '10-B1' || /^10-B\d+$/.test(plan[0].blockKey));
const plan2 = planSeatAllocation(entries, halls);
t('تخصیص مجدد = همان خروجی (deterministic)', JSON.stringify(plan) === JSON.stringify(plan2));
const overflow = planSeatAllocation(
  Array.from({ length: 151 }, (_, i) => ({ enrollmentId: i + 1, studentId: i + 1, offeringId: 1 })),
  halls,
);
t('ظرفیت ۱۵۰ → صندلی‌ها تمام و بدون تخصیص اضافه', overflow.length === 150);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail > 0 ? 1 : 0);
