/**
 * تست واحد هستهٔ خالص کارتابل برنامه‌ریزی درسی — بدون React و بدون DB
 *
 * اجرا: npm test
 * پوشش: این توابع تا دور قبل داخل یک کامپوننت ۲۳۵۸ سطری بودند و هیچ تستی
 * نداشتند. حالا در src/app/admin/scheduling/planning-core.ts نشسته‌اند:
 *   faNum / faToEnDigits / parseJalaliDates (رقوم و تاریخ جلالی از متن آزاد)
 *   mapDemands / mapOfferings / mapCohorts (نگاشت ردیف سرور → مدل UI)
 *   computeProfUnits (بار واحد استاد + تقسیم سهم درس مشترک)
 *   slotAvailStatus (پوشش بازهٔ اعلامی استاد روی یک اسلات)
 *   filterScenarioOfferings / filterContextDemands (فیلتر زمینهٔ صفحه)
 *   inspectorSummary / nextGroupNumber / coTeachingWeights / buildRealScenario
 */
import {
  buildRealScenario, coTeachingWeights, computeProfUnits, DAY_NAMES, faNum, faToEnDigits,
  filterContextDemands, filterScenarioOfferings, inspectorSummary, mapCohorts, mapDemands,
  mapOfferings, nextGroupNumber, NO_PROFESSOR, parseJalaliDates, PHASE_LABELS,
  slotAvailStatus, TIME_SLOT_PRESETS, PLANNING_TABS, resolveTab,
} from '../src/app/admin/scheduling/planning-core.ts';
import type { CourseDemand, DepartmentOffering, SchedulingWorkspace } from '../src/app/admin/scheduling/types.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

console.log('۱) رقم فارسی و استخراج تاریخ جلالی');
eq('عدد → فارسی', faNum(1234), '۱۲۳۴');
eq('null → خط تیره', faNum(null), '—');
eq('undefined → خط تیره', faNum(undefined), '—');
eq('صفر حفظ می‌شود (نه falsy!)', faNum(0), '۰');
eq('داخل رشته هم تبدیل می‌شود', faNum('term 12'), 'term ۱۲');
eq('فارسی → لاتین', faToEnDigits('۱۴۰۵/۰۷/۰۱'), '1405/07/01');
eq('عربی (هندی-عربی) → لاتین', faToEnDigits('١٤٠٥'), '1405');
eq('تاریک‌های لاتین از متن آزاد', parseJalaliDates('تعطیل 1405/07/01 و 1405/07/29'), ['1405/07/01', '1405/07/29']);
eq('رقم فارسی + ممیز عربی + فاصله', parseJalaliDates('  ۱۴۰۵٫۰۷٫۰۱  '), ['1405/07/01']);
eq('رقم فارسی با اسلش', parseJalaliDates('تعطیل: ۱۴۰۵/۰۷/۲۹'), ['1405/07/29']);
eq('مخلوط لاتین/فارسی در یک متن', parseJalaliDates('1405/07/01 و ۱۴۰۵/۰۷/۰۲'), ['1405/07/01', '1405/07/02']);
eq('تاریک کوتاه‌شدهٔ سال‌دار فقط', parseJalaliDates('07/01'), []);
eq('بدون تاریخ → آرایهٔ خالی', parseJalaliDates('جمعه تعطیل است'), []);
eq('ماه/روز یک‌رقمی هم قبول', parseJalaliDates('1405/7/1'), ['1405/7/1']);

console.log('\n۲) نگاشت ردیف سرور → مدل UI');
const rawDemand = {
  offeringId: 7, courseId: 11, courseDeptId: 3, code: '101', title: 'ریاضی', units: '3.00',
  courseType: 'اصلی', capacity: 40, groupNumber: 2, professorId: 5, isCoTaught: false,
  enrolledCount: 30, programId: 2, programTitle: 'کامپیوتر', cohortId: '1403', cohortTitle: 'ورودی ۱۴۰۳',
};
const [d] = mapDemands([rawDemand]);
eq('واحد رشته‌ای → عدد', d.units, 3);
eq('واحد نامعتبر → صفر', mapDemands([{ ...rawDemand, units: '—' }])[0].units, 0);
eq('نوع درس ناشناخته → عمومی', mapDemands([{ ...rawDemand, courseType: 'آزاد' }])[0].courseType, 'عمومی');
eq('استاد null → صفر (نه undefined)', mapDemands([{ ...rawDemand, professorId: null }])[0].preferredProfId, 0);
eq('پیش‌فرض‌های ایمن نشست', [d.requiredRoomType, d.groupsCount, d.weekRecurrence, d.examDate], ['THEORY', 1, 'ALL', '']);
eq('کارت تهی هیچ‌وقت undefined نمی‌شود', NO_PROFESSOR.id, 0);
const [co] = mapCohorts([{ entryYear: 1403, expectedStudents: 120 }]);
eq('عنوان ورودی با رقم فارسی', co.title, 'ورودی ۱۴۰۳');
eq('کلید ورودی رشتهٔ عددی', co.id, '1403');

const rawApproved = {
  offeringId: 9, code: '202', title: 'فیزیک', units: '2', courseType: 'پایه', groupNumber: 1,
  professorId: 4, professorName: 'دکتر الف', capacity: 35, enrolledCount: 20,
  dayOfWeek: 3, dayName: 'دوشنبه', startTime: '08:00', endTime: '10:00',
  roomId: 6, roomName: 'A1', buildingName: 'پردیس مرکزی',
};
const [off] = mapOfferings([rawApproved]);
eq('روز ۱‌پایه دیتابیس → شاخص ۰‌پایه UI', off.classSchedules[0].dayOfWeek, 2);
eq('روز null → شنبه (شاخص صفر)', mapOfferings([{ ...rawApproved, dayOfWeek: null }])[0].classSchedules[0].dayOfWeek, 0);
eq('نام سالن و ساختمان حفظ شد', [off.classSchedules[0].roomName, off.classSchedules[0].buildingName], ['A1', 'پردیس مرکزی']);
eq('فیلتر/حوزهٔ کلی برای ورودی‌ها', [off.cohortId, off.programId], ['ALL', 0]);

console.log('\n۳) بار واحد استاد (درس مشترک = تقسیم سهم)');
const base: CourseDemand = {
  id: 1, courseId: 1, courseDeptId: null, programId: 1, programTitle: 'کامپیوتر', cohortId: 'ALL',
  cohortTitle: 'ورودی ۱۴۰۳', code: 'C1', title: 'درس', units: 3, groupNumber: 1, courseType: 'اصلی',
  preferredProfId: 1, requiredRoomType: 'THEORY', capacity: 40, groupsCount: 1,
  weekRecurrence: 'ALL', sessionsCountPerWeek: 1, examDate: '',
};
const profs = [
  { id: 1, name: 'الف', staffCode: '1', academicRank: 'استادیار', contractType: 'تمام‌وقت' as const, departmentName: 'گروه', maxWeeklyUnits: 16, maxDailyHours: 6, hasSubmittedAvailability: true },
  { id: 2, name: 'ب', staffCode: '2', academicRank: 'مربی', contractType: 'نیمه‌وقت' as const, departmentName: 'گروه', maxWeeklyUnits: 8, maxDailyHours: 4, hasSubmittedAvailability: false },
];
eq('درس تکی × گروه‌های موازی', computeProfUnits([{ ...base, units: 3, groupsCount: 2 }], profs)[1].units, 6);
eq('درس تکی → تعداد گروه‌ها شمرده می‌شود', computeProfUnits([{ ...base, groupsCount: 3 }], profs)[1].coursesCount, 3);
eq('استاد نامعلوم → بدون خطا و بدون کلید جدید', Object.keys(computeProfUnits([{ ...base, preferredProfId: 99 }], profs)).length, 2);
// ۳ واحد × ۷۰٪ = ۲٫۱ برای تئوری و ۳ × ۳۰٪ = ۰٫۹ برای عملی
const coTaught = [{ ...base, isCoTaught: true, coProfId: 2, theoryWeightRatio: 0.7, labWeightRatio: 0.3 }];
eq('سهم تئوری استاد اول', computeProfUnits(coTaught, profs)[1].units, 2.1);
eq('سهم عملی استاد دوم', computeProfUnits(coTaught, profs)[2].units, 0.9);
eq('مجموع سهم = واحد درس (یک‌دهم تلورانس)', Math.round((computeProfUnits(coTaught, profs)[1].units + computeProfUnits(coTaught, profs)[2].units) * 10) / 10, 3);
eq('سهم‌های پیش‌فرض بدون مقدار (۰٫۷/۰٫۳)',
   computeProfUnits([{ ...base, units: 4, isCoTaught: true, coProfId: 2 }], profs)[2].units, 1.2);
eq('مشترک بدون استاد دوم → سهم کامل به استاد اول',
   computeProfUnits([{ ...base, units: 2, isCoTaught: true }], profs)[1].units, 2);

console.log('\n۴) وضعیت درٔ دسترس بودن استاد روی اسلات');
const av = (over: Partial<SchedulingWorkspace['availabilities'][number]> = {}): SchedulingWorkspace['availabilities'][number] => ({
  staffId: 1, dayOfWeek: 1, startTime: '08:00', endTime: '10:00', status: 'PREF', ...over,
});
const SLOT = { startTime: '08:00' };
eq('پوشش کامل با اولویت → PREF', slotAvailStatus([av()], 1, 0, SLOT), 'PREF');
eq('وضعیت AVAIL', slotAvailStatus([av({ status: 'AVAIL' })], 1, 0, SLOT), 'AVAIL');
eq('استاد دیگر → NONE', slotAvailStatus([av({ staffId: 2 })], 1, 0, SLOT), 'NONE');
eq('روز دیگر → NONE (شاخص ۰‌پایه + ۱)', slotAvailStatus([av({ dayOfWeek: 2 })], 1, 0, SLOT), 'NONE');
eq('بازهٔ تمام‌شده در شروع اسلات → NONE', slotAvailStatus([av({ startTime: '06:00', endTime: '08:00' })], 1, 0, SLOT), 'NONE');
eq('شروع میانی بازه هم پوشش است', slotAvailStatus([av({ startTime: '07:30', endTime: '09:00' })], 1, 0, SLOT), 'PREF');
eq('PREF بر AVAIL مقدم است', slotAvailStatus([av({ status: 'AVAIL' }), av({ status: 'PREF' })], 1, 0, SLOT), 'PREF');
eq('ردیف بدون ساعت → نادیده', slotAvailStatus([av({ startTime: null, endTime: null })], 1, 0, SLOT), 'NONE');
eq('بدون هیچ ردیف → NONE', slotAvailStatus([], 1, 0, SLOT), 'NONE');

console.log('\n۵) فیلتر زمینهٔ صفحه (رشته / ورودی / نمای هفته)');
const mkOff = (over: Partial<DepartmentOffering> = {}): DepartmentOffering => ({
  id: 1, termId: 0, programId: 0, programTitle: '—', cohortId: 'ALL', cohortTitle: '—', courseId: 1,
  code: 'C1', title: 't', units: 3, courseType: 'اصلی', groupNumber: 1, professorId: 1, professorName: 'x',
  capacity: 40, enrolledCount: 0, waitlistCapacity: 0,
  classSchedules: [{ dayOfWeek: 0, dayName: DAY_NAMES[0], slotId: 1, startTime: '08:00', endTime: '10:00', roomId: 1, roomName: 'r', buildingName: 'b', weekType: 'ALL' }],
  examSchedule: null, ...over,
});
const list = [
  mkOff({ id: 1, programId: 0, cohortId: 'ALL' }),                       // عمومی → همیشه
  mkOff({ id: 2, programId: 7, cohortId: 'ALL' }),                        // رشتهٔ ۷
  mkOff({ id: 3, programId: 7, cohortId: '1403' }),                       // رشتهٔ ۷ ورودی ۱۴۰۳
  mkOff({ id: 4, programId: 8, cohortId: 'ALL', classSchedules: [{ ...mkOff().classSchedules[0], weekType: 'EVEN' }] }),
];
eq('بدون فیلتر → همه', filterScenarioOfferings(list, { programId: 0, cohortId: 'ALL', weekFilter: 'ALL_VIEW' }).length, 4);
eq('رشتهٔ ۷ → عمومی + ۷', filterScenarioOfferings(list, { programId: 7, cohortId: 'ALL', weekFilter: 'ALL_VIEW' }).map(o => o.id), [1, 2, 3]);
eq('ورودی ۱۴۰۳ → عمومی + آن ورودی', filterScenarioOfferings(list, { programId: 0, cohortId: '1403', weekFilter: 'ALL_VIEW' }).map(o => o.id), [1, 2, 3, 4]);
eq('ورودی ۱۴۰۳ روی رشتهٔ ۷', filterScenarioOfferings(list, { programId: 7, cohortId: '1403', weekFilter: 'ALL_VIEW' }).map(o => o.id), [1, 2, 3]);
eq('نمای زوج → ALL و EVEN', filterScenarioOfferings(list, { programId: 0, cohortId: 'ALL', weekFilter: 'EVEN' }).map(o => o.id), [1, 2, 3, 4]);
eq('نمای فرد → فقط ALL', filterScenarioOfferings(list, { programId: 0, cohortId: 'ALL', weekFilter: 'ODD' }).map(o => o.id), [1, 2, 3]);
const dl = [{ ...base, id: 1, programId: 0, cohortId: 'ALL' }, { ...base, id: 2, programId: 7, cohortId: '1403' }, { ...base, id: 3, programId: 8, cohortId: '1404' }];
eq('تقاضا: رشتهٔ ۷ + عمومی', filterContextDemands(dl, { programId: 7, cohortId: 'ALL' }).map(x => x.id), [1, 2]);
eq('تقاضا: ورودی ۱۴۰۴', filterContextDemands(dl, { programId: 0, cohortId: '1404' }).map(x => x.id), [1, 3]);

console.log('\n۶) آمار بازرس، گروه بعدی و سهم‌بندی');
const io = [
  mkOff({ professorId: 1, units: 3, programTitle: 'کامپیوتر' }),
  mkOff({ professorId: 1, units: 2, programTitle: 'ریاضی', classSchedules: [{ ...mkOff().classSchedules[0], dayOfWeek: 2 }] }),
  mkOff({ professorId: 2, units: 4 }),
];
eq('مجموع واحد استاد', inspectorSummary(io.filter(o => o.professorId === 1), 16).totalUnits, 5);
eq('درصد سهمیه (۵/۱۶)', inspectorSummary(io.filter(o => o.professorId === 1), 16).quotaPercent, 31);
eq('سقف بیش از حد → سقف ۱۰۰٪', inspectorSummary(io, 2).quotaPercent, 100);
eq('سقف صفر → صفر، نه NaN', inspectorSummary(io, 0).quotaPercent, 0);
eq('روزهای در‌گیر', inspectorSummary(io.filter(o => o.professorId === 1), 16).distinctDays, 2);
eq('رشته‌های یکتا', inspectorSummary(io.filter(o => o.professorId === 1), 16).distinctPrograms, ['کامپیوتر', 'ریاضی']);
eq('هیچ ارائه‌ای → صفرها', inspectorSummary([], 16), { totalUnits: 0, groupsCount: 0, distinctDays: 0, distinctPrograms: [], quotaPercent: 0 });
eq('گروه اول وقتی چیزی نیست', nextGroupNumber([]), 1);
eq('بیشینه + ۱', nextGroupNumber([1, 3, 2]), 4);
eq('سهم متوازن', coTeachingWeights(50), { theory: 0.5, lab: 0.5 });
eq('سقف ۹۰٪ تئوری', coTeachingWeights(95), { theory: 0.9, lab: 0.1 });
eq('کف ۱۰٪ تئوری', coTeachingWeights(5), { theory: 0.1, lab: 0.9 });
const w33 = coTeachingWeights(33);
eq('مکملِ ۱ با تلورانس ممیز شناور', Math.round((w33.theory + w33.lab) * 100) / 100, 1);
eq('سهم ۳۳٪ دقیقاً ۰٫۳۳ است', [w33.theory, w33.lab], [0.33, 0.67]);

console.log('\n۷) آرایش زنگ تفریح و سناریوی واقعی');
eq('چهار فاز برچسب دارد', Object.keys(PHASE_LABELS).sort(), ['ALLOCATION', 'PUBLISHED', 'REVIEW', 'SUPPLY']);
eq('شش روز کاری', DAY_NAMES.length, 6);
for (const key of Object.keys(TIME_SLOT_PRESETS) as (keyof typeof TIME_SLOT_PRESETS)[]) {
  const p = TIME_SLOT_PRESETS[key];
  const bad = p.slots.filter((s, i) => {
    const dur = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
    return dur(s.startTime) >= dur(s.endTime) || s.id !== i + 1;
  });
  eq(`«${key}» — اسلات‌ها مرتب، یکتا و با پایان بعد از شروع`, bad.length, 0);
  eq(`«${key}» — حداقل یک استراحت`, p.slots.filter(s => s.isBreak).length >= 1, true);
}
const scen = buildRealScenario(io, 0, 48, 7);
eq('بدون تداخل → «صفر»', scen.kpi.conflictsRate, 'صفر');
eq('تداخل سخت نمایش داده می‌شود', buildRealScenario(io, 3, 48, 7).kpi.conflictsRate, '۳ تداخل سخت');
eq('جلسات در KPI', scen.kpi.commuteScore, '۴۸ جلسه');
eq('بهره‌وری سالن = تعداد سهمیه', scen.kpi.roomEfficiency, '۷');
eq('روزهای distinct از همهٔ ارائه‌ها', scen.kpi.daysPerWeek, '۲');
eq('سناریو همان ارائه‌های ورودی است (بدون Solver)', scen.offerings.length, io.length);

console.log('\n۸) تب آغازین از query string (resolveTab)');
eq('مقدار معتبر همان تب است', resolveTab('SCENARIOS'), 'SCENARIOS');
eq('حروف کوچک هم پذیرفته می‌شود', resolveTab('approved'), 'APPROVED');
eq('فاصله اضافه پاک می‌شود', resolveTab('  DEPT_ROOMS  '), 'DEPT_ROOMS');
eq('undefined → تب اول', resolveTab(undefined), 'CURRICULUM_ASSIGN');
eq('null → تب اول', resolveTab(null), 'CURRICULUM_ASSIGN');
eq('رشتهٔ بی‌ربط → تب اول', resolveTab('../../etc/passwd'), 'CURRICULUM_ASSIGN');
eq('همهٔ تب‌های مشروع برگردانده می‌شوند', PLANNING_TABS.map(resolveTab), [...PLANNING_TABS]);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
