/**
 * تست واحد هستهٔ خالص موتور برنامه‌ریزی درسی — بدون React و بدون DB
 *
 * اجرا: npm test
 * پوشش: اعتبارسنجی گروه‌ها (سقف ۲۰ گروه، ظرفیت، جنسیت، شیفت)، هم‌پوشانی
 * زمانی، امتیازدهی پیشنهادها (زونینگ دانشکده + ترجیح استاد + ظرفیت)،
 * پیش‌بینی تعداد گروه، توزیع سهمیهٔ کلاس‌ها، ماشین فازها و سلامت برنامه.
 */
import {
  allocateQuotaShifts, calculateSlotScore, canAllocateInPhase, canEditInPhase,
  canTransition, classifyUtilization, distributeGroupsByFaculty, GENDERS,
  MAX_GROUPS, overlaps, SCORE, shiftOf, shiftUtilization, suggestedGroupCount,
  toMinutes, validateGroupDrafts, type Shift,
} from '../src/lib/scheduling-core.ts';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};
const throws = (name: string, fn: () => unknown, msgPart?: string) => {
  try {
    fn();
    fail++;
    console.log(`  ✗ ${name} (خطا نداد)`);
  } catch (e: any) {
    const ok = !msgPart || String(e?.message ?? e).includes(msgPart);
    if (ok) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} — پیام: ${e?.message}`); }
  }
};

const mk = (over: Partial<Parameters<typeof validateGroupDrafts>[0][number]> = {}) => ({
  groupNumber: 1, capacity: 40, gender: 'MIXED' as const,
  professorId: 10, classroomId: 100, dayOfWeek: 2,
  startTime: '08:00', endTime: '09:30', ...over,
});

console.log('۱) اعتبارسنجی گروه‌های درسی (سقف ۲۰، ظرفیت، جنسیت، شیفت)');
throws('لیست خالی', () => validateGroupDrafts([], false), 'هیچ گروه درسی');
throws('۲۱ گروه', () => validateGroupDrafts(Array.from({ length: MAX_GROUPS + 1 }, (_, i) => mk({ groupNumber: i + 1 })), false), 'بیشتر است');
throws('شمارهٔ گروه صفر', () => validateGroupDrafts([mk({ groupNumber: 0 })], false), 'شمارهٔ گروه نامعتبر');
throws('شمارهٔ گروه تکراری', () => validateGroupDrafts([mk({ groupNumber: 1 }), mk({ groupNumber: 1 })], false), 'تکراری');
throws('ظرفیت ۳', () => validateGroupDrafts([mk({ capacity: 3 })], false), 'ظرفیت');
throws('ظرفیت ۶۰۰', () => validateGroupDrafts([mk({ capacity: 600 })], false), 'ظرفیت');
throws('ظرفیت اعشاری', () => validateGroupDrafts([mk({ capacity: 40.5 })], false), 'ظرفیت');
throws('جنسیت نامعتبر', () => validateGroupDrafts([mk({ gender: 'COED' as any })], false), 'جنسیت');
throws('استاد صفر', () => validateGroupDrafts([mk({ professorId: 0 })], false), 'استاد');
throws('کلاس صفر', () => validateGroupDrafts([mk({ classroomId: 0 })], false), 'کلاس فیزیکی');
throws('روز صفر', () => validateGroupDrafts([mk({ dayOfWeek: 0 })], false), 'روز');
throws('روز هفت', () => validateGroupDrafts([mk({ dayOfWeek: 7 })], false), 'روز');
throws('پایان قبل از شروع', () => validateGroupDrafts([mk({ startTime: '10:00', endTime: '09:00' })], false), 'بازهٔ زمانی');
throws('مدت ۵ ساعت', () => validateGroupDrafts([mk({ startTime: '08:00', endTime: '13:00' })], false), '۴ ساعت');
throws('عبور از مرز شیفت (۱۰:۳۰–۱۳:۰۰)', () => validateGroupDrafts([mk({ startTime: '10:30', endTime: '13:00' })], false), 'مرز شیفت');
throws('قالب ساعت غلط', () => validateGroupDrafts([mk({ startTime: '8am' })], false), 'قالب ساعت');

{
  const out = validateGroupDrafts([mk({ groupNumber: 2, startTime: '14:00', endTime: '15:30' }), mk({ groupNumber: 1 })], false);
  eq('ترتیب صعودی شمارهٔ گروه', out.map(g => g.groupNumber), [1, 2]);
  eq('شیفت صبح ۰۸–۰۹:۳۰', out[0].shift, 'MORNING');
  eq('شیفت عصر ۱۴–۱۵:۳۰', out[1].shift, 'EVENING');
  eq('دقیقهٔ شروع نرمال', out[0].startMinutes, 480);
}

console.log('\n۲) ابزار زمان و هم‌پوشانی');
eq('toMinutes(08:30)=510', toMinutes('08:30'), 510);
throws('toMinutes غلط', () => toMinutes('25:00'), 'قالب ساعت');
eq('همپوشانی ۸-۱۰ با ۹-۱۱', overlaps(480, 600, 540, 660), true);
eq('تماس ۸-۱۰ و ۱۰-۱۲ تداخل نیست', overlaps(480, 600, 600, 720), false);
eq('زیرمجموعه', overlaps(480, 720, 500, 600), true);
eq('کاملاً جدا', overlaps(480, 540, 660, 720), false);
throws('shiftOf عبور از مرز', () => shiftOf(600, 780), 'مرز شیفت');

console.log('\n۳) امتیازدهی پیشنهادها (زونینگ + ترجیح + ظرفیت)');
{
  const best = calculateSlotScore({ roomFacultyId: 2, targetFacultyId: 2, inPreferredWindow: true, inAvailableWindow: true, roomCapacity: 50, requiredCapacity: 40 });
  eq('طلایی: همدانشکده + ترجیح + تناسب عالی = ۱۲۰', best.score, SCORE.sameFaculty + SCORE.preferredTime + SCORE.capacityPerfect);
  const cross = calculateSlotScore({ roomFacultyId: 3, targetFacultyId: 2, inPreferredWindow: false, inAvailableWindow: true, roomCapacity: 70, requiredCapacity: 40 });
  eq('بین‌دانشکده + غیرترجیح + تناسب خوب = ۴۰', cross.score, SCORE.crossFaculty + SCORE.okTime + SCORE.capacityGood);
  const capLow = calculateSlotScore({ roomFacultyId: 2, targetFacultyId: 2, inPreferredWindow: true, inAvailableWindow: true, roomCapacity: 30, requiredCapacity: 40 });
  eq('ظرفیت ناکافی → منفی (هرگز پیشنهاد نمی‌شود)', capLow.score, SCORE.capacityOver);
  eq('دلیل ظرفیت ناکافی', capLow.reasons[0].includes('کمتر از نیاز'), true);
  const noFac = calculateSlotScore({ roomFacultyId: null, targetFacultyId: null, inPreferredWindow: true, inAvailableWindow: true, roomCapacity: 40, requiredCapacity: 40 });
  eq('بدون دانشکدهٔ هدف → امتیاز پایهٔ مکانی', noFac.score, SCORE.crossFaculty + SCORE.preferredTime + SCORE.capacityPerfect);
  const noAvail = calculateSlotScore({ roomFacultyId: 2, targetFacultyId: 2, inPreferredWindow: false, inAvailableWindow: false, roomCapacity: 40, requiredCapacity: 40 });
  eq('خارج از ساعات حضور → -۱۰۰', noAvail.score, -100);
  const overCap = calculateSlotScore({ roomFacultyId: 2, targetFacultyId: 2, inPreferredWindow: true, inAvailableWindow: true, roomCapacity: 100, requiredCapacity: 40 });
  eq('مازاد ≥۴۰ نفر → بدون امتیاز ظرفیت', overCap.score, SCORE.sameFaculty + SCORE.preferredTime);
}

console.log('\n۴) پیش‌بینی تعداد گروه از تقاضا');
eq('صفر متقاضی → ۱ گروه (حفظ درس)', suggestedGroupCount(0, 40), 1);
eq('۳۹ نفر → ۱ گروه', suggestedGroupCount(39, 40), 1);
eq('۴۱ نفر → ۲ گروه', suggestedGroupCount(41, 40), 2);
eq('۲۱۰ نفر → ۶ گروه', suggestedGroupCount(210, 40), 6);
eq('سقف ۲۰ گروه', suggestedGroupCount(900, 40), MAX_GROUPS);
throws('ظرفیت صفر', () => suggestedGroupCount(10, 0), 'ظرفیت استاندارد');
throws('متقاضی منفی', () => suggestedGroupCount(-5, 40), 'نامعتبر');

{
  const dist = distributeGroupsByFaculty(
    [{ facultyId: 1, eligible: 55 }, { facultyId: 2, eligible: 15 }], 40);
  eq('دانشکدهٔ پرجمعیت اول و ۲ گروه', [dist[0].facultyId, dist[0].groups], [1, 2]);
  eq('دانشکدهٔ کم‌جمعیت ۱ گروه', dist[1].groups, 1);
}

console.log('\n۵) توزیع سهمیهٔ (سالن، شیفت)');
{
  const rooms = [
    { classroomId: 1, capacity: 100, shifts: ['MORNING','EVENING'] as Shift[] },
    { classroomId: 2, capacity: 60, shifts: ['MORNING','EVENING'] as Shift[] },
  ];
  const grants = allocateQuotaShifts(rooms, [
    { departmentId: 10, activeStudents: 300 }, { departmentId: 20, activeStudents: 100 },
  ]);
  eq('جمع گرنت‌ها = اسلات‌ها (۴)', grants.length, 4);
  const d10 = grants.filter(g => g.departmentId === 10).length;
  const d20 = grants.filter(g => g.departmentId === 20).length;
  eq('سهم ۷۵٪ → ۳ اسلات', d10, 3);
  eq('سهم ۲۵٪ → ۱ اسلات', d20, 1);
  eq('سالن بزرگ‌تر اول به گروه پرجمعیت', grants[0].classroomId, 1);
  const equal = allocateQuotaShifts(rooms, [
    { departmentId: 10, activeStudents: 50 }, { departmentId: 20, activeStudents: 50 },
  ]);
  const e10 = equal.filter(g => g.departmentId === 10).length;
  eq('مساوی → ۲/۲', e10, 2);
  eq('بدون دانشجو → بدون گرنت', allocateQuotaShifts(rooms, []).length, 0);
}

console.log('\n۶) ماشین فازها و سلامت');
eq('SUPPLY→ALLOCATION مجاز', canTransition('SUPPLY', 'ALLOCATION'), true);
eq('SUPPLY→REVIEW ناقانونی', canTransition('SUPPLY', 'REVIEW'), false);
eq('REVIEW→PUBLISHED مجاز', canTransition('REVIEW', 'PUBLISHED'), true);
eq('PUBLISHED→جایی ممنوع', canTransition('PUBLISHED', 'REVIEW'), false);
eq('ویرایش در SUPPLY مجاز', canEditInPhase('SUPPLY'), true);
eq('ویرایش در PUBLISHED ممنوع', canEditInPhase('PUBLISHED'), false);
eq('تخصیص در SUPPLY ممنوع', canAllocateInPhase('SUPPLY'), false);
eq('تخصیص در ALLOCATION مجاز', canAllocateInPhase('ALLOCATION'), true);
eq('تخصیص در PUBLISHED ممنوع', canAllocateInPhase('PUBLISHED'), false);
eq('۲۰/۴۰ = UNDERFILLED', classifyUtilization(20, 40), 'UNDERFILLED');
eq('۳۰/۴۰ = NORMAL', classifyUtilization(30, 40), 'NORMAL');
eq('۳۶/۴۰ = FULL', classifyUtilization(36, 40), 'FULL');
eq('۴۱/۴۰ = OVERBOOKED', classifyUtilization(41, 40), 'OVERBOOKED');
eq('ظرفیت صفر = OVERBOOKED', classifyUtilization(0, 0), 'OVERBOOKED');
eq('نیم‌شیفت استفاده = ۰٫۵', shiftUtilization(120, 240), 0.5);
eq('شیفت خالی = ۰', shiftUtilization(0, 240), 0);

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
