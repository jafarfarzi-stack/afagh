/**
 * تستِ هستهٔ «تداخل‌های واقعی برنامهٔ هفتگی».
 *
 * چیزی که اینجا قفل می‌شود همان چیزی است که در ترم ۱۴۰۵۱ گران تمام شد:
 * تفاوتِ «هم‌پوشانیِ خام» با «تداخلِ واقعی». اگر روزی کسی قاعدهٔ ادغام را
 * عوض کند، این تست‌ها می‌گویند چه چیزی شکسته — نه اینکه کارشناس آموزش
 * دوباره ۷۱۶ ردیفِ الکی ببیند.
 */
import {
  conflictFingerprint,
  dedupeSlots,
  detectScheduleConflicts,
  groupConflictsByEntity,
  isExplicitlySplit,
  isMergedPair,
  minutesToHm,
  overlapMinutes,
  sharedMergeKey,
  summarizeConflicts,
  toMinutes,
  type ConflictSlot,
} from '../src/lib/schedule-conflicts-core';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}`, extra ?? ''); }
}
function eq<T>(name: string, actual: T, expected: T) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}

function slot(over: Partial<ConflictSlot> & { scheduleId: number; offeringId: number }): ConflictSlot {
  return {
    dayOfWeek: 0,
    startTime: '08:00',
    endTime: '10:00',
    roomId: 1,
    roomName: 'کلاس ۱',
    professorId: 10,
    professorName: 'استاد الف',
    courseCode: '1000',
    courseTitle: 'درس',
    groupNumber: 1,
    enrolledCount: 10,
    sharedScheduleGroupKey: null,
    ...over,
  };
}

console.log('\n=== زمان و هم‌پوشانی ===');
eq('toMinutes 08:30', toMinutes('08:30'), 510);
eq('toMinutes نامعتبر', toMinutes('xx'), null);
eq('toMinutes ساعت ۲۴', toMinutes('24:00'), null);
eq('minutesToHm', minutesToHm(510), '08:30');
eq('هم‌پوشانی کامل', overlapMinutes(480, 600, 480, 600), 120);
eq('هم‌پوشانی جزئی', overlapMinutes(480, 600, 570, 660), 30);
eq('بدون هم‌پوشانی (چسبیده)', overlapMinutes(480, 600, 600, 660), 0);
eq('بدون هم‌پوشانی (جدا)', overlapMinutes(480, 600, 700, 800), 0);

console.log('\n=== قاعدهٔ ادغام ===');
eq('کلید SOLO ادغام نیست', sharedMergeKey('SOLO-12'), null);
eq('کلید خالی', sharedMergeKey('  '), null);
eq('کلید معتبر', sharedMergeKey('SAMA14051:1:0:0800'), 'SAMA14051:1:0:0800');
ok(
  'زمان و سالن یکسان ⇒ ادغامی',
  isMergedPair(slot({ scheduleId: 1, offeringId: 1 }), slot({ scheduleId: 2, offeringId: 2 })),
);
ok(
  'زمان یکسان، سالنِ یکی NULL ⇒ ادغامی (مورد استاد ۱۳۴)',
  isMergedPair(
    slot({ scheduleId: 1, offeringId: 1, roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 2, roomId: null }),
  ),
);
ok(
  'زمان یکسان، سالن‌های متفاوت ⇒ ادغامی نیست',
  !isMergedPair(
    slot({ scheduleId: 1, offeringId: 1, roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 2, roomId: 6 }),
  ),
);
ok(
  'کلید مشترک ⇒ ادغامی حتی با ساعت متفاوت',
  isMergedPair(
    slot({ scheduleId: 1, offeringId: 1, sharedScheduleGroupKey: 'K1' }),
    slot({ scheduleId: 2, offeringId: 2, startTime: '09:00', endTime: '11:00', sharedScheduleGroupKey: 'K1' }),
  ),
);
ok(
  'کلید SOLO ⇒ ادغام نیست',
  !isMergedPair(
    slot({ scheduleId: 1, offeringId: 1, sharedScheduleGroupKey: 'SOLO-1' }),
    slot({ scheduleId: 2, offeringId: 2, sharedScheduleGroupKey: 'SOLO-1' }),
  ),
);

console.log('\n=== تشخیص ===');
{
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 2, roomId: 6 }),
  ]);
  eq('هم‌پوشانی خام', r.rawOverlaps, 1);
  eq('ادغامی حذف‌شده', r.mergedSkipped, 0);
  eq('تداخل استاد', r.pairs.filter(p => p.kind === 'PROFESSOR').length, 1);
  eq('تداخل سالن (سالن‌ها متفاوت)', r.pairs.filter(p => p.kind === 'ROOM').length, 0);
  eq('طول هم‌پوشانی', r.pairs[0]?.overlapMinutes, 120);
}

{
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 2, roomId: 5 }),
  ]);
  eq('زمان+سالن یکسان ⇒ هیچ تداخلی', r.pairs.length, 0);
  eq('ولی به‌عنوان ادغامی شمرده شد', r.mergedSkipped, 1);
}

{
  // دو ارائهٔ متفاوت در یک سالن با ساعت‌های هم‌پوشان و استادهای متفاوت
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, professorId: 10, roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 2, professorId: 11, roomId: 5, startTime: '09:00', endTime: '11:00' }),
  ]);
  eq('تداخل سالن', r.pairs.filter(p => p.kind === 'ROOM').length, 1);
  eq('تداخل استاد ندارد', r.pairs.filter(p => p.kind === 'PROFESSOR').length, 0);
  eq('هم‌پوشانی یک‌ساعته', r.pairs[0]?.overlapMinutes, 60);
}

{
  // دو اسلاتِ یک ارائه هرگز تداخل گزارش نمی‌شود
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 7 }),
    slot({ scheduleId: 2, offeringId: 7, startTime: '09:00', endTime: '11:00' }),
  ]);
  eq('هم‌ارائه', r.pairs.length, 0);
}

{
  // روزهای مختلف ⇒ بدون تداخل
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, dayOfWeek: 0 }),
    slot({ scheduleId: 2, offeringId: 2, dayOfWeek: 1 }),
  ]);
  eq('روزهای متفاوت', r.pairs.length, 0);
}

{
  // روزِ NULL (برنامهٔ بدون روز) نباید کرش کند و تداخل هم نیست
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, dayOfWeek: null }),
    slot({ scheduleId: 2, offeringId: 2, dayOfWeek: null }),
  ]);
  eq('روز NULL', r.pairs.length, 0);
}

{
  // بازهٔ معکوس = دادهٔ خراب، نه تداخل
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, startTime: '10:00', endTime: '08:00' }),
    slot({ scheduleId: 2, offeringId: 2 }),
  ]);
  eq('بازهٔ معکوس', r.pairs.length, 0);
}

console.log('\n=== ردیف‌های تکراری و شمارشِ درست ===');
eq('تشخیص SOLO', isExplicitlySplit('SOLO-5'), true);
eq('کلید معمولی SOLO نیست', isExplicitlySplit('MC-1-2'), false);
{
  const d = dedupeSlots([
    slot({ scheduleId: 1, offeringId: 1 }),
    slot({ scheduleId: 2, offeringId: 1 }),
    slot({ scheduleId: 3, offeringId: 1 }),
    slot({ scheduleId: 4, offeringId: 1, startTime: '11:00', endTime: '12:00' }),
  ]);
  eq('سه ردیفِ یکسان ⇒ یک اسلات', d.slots.length, 2);
  eq('حذف‌شده', d.removed, 2);
}
{
  // دو ارائهٔ بی‌ربط (نه استاد مشترک، نه سالن مشترک) نباید در «هم‌پوشانی خام» شمرده شوند
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, professorId: 10, roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 2, professorId: 11, roomId: 6 }),
  ]);
  eq('جفت بی‌ربط: هم‌پوشانی خام صفر', r.rawOverlaps, 0);
  eq('جفت بی‌ربط: تداخل صفر', r.pairs.length, 0);
  eq('اسلات بررسی‌شده', r.slotsScanned, 2);
  eq('تکراری', r.duplicateSlots, 0);
}
{
  // سه ردیفِ تکراری از یک ارائه + یک ارائهٔ رقیب ⇒ فقط یک تداخل
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 1, roomId: 5 }),
    slot({ scheduleId: 3, offeringId: 1, roomId: 5 }),
    slot({ scheduleId: 4, offeringId: 2, roomId: 6 }),
  ]);
  eq('تداخل تکراری نمی‌شود', r.pairs.length, 1);
  eq('تکراری‌های حذف‌شده', r.duplicateSlots, 2);
}

console.log('\n=== اثرانگشت و خلاصه ===');
eq('اثرانگشت مستقل از ترتیب', conflictFingerprint('PROFESSOR', 10, 0, 9, 3), 'PROFESSOR:10:0:3:9');
{
  const pairs = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, roomId: 5, professorId: 10, enrolledCount: 20 }),
    slot({ scheduleId: 2, offeringId: 2, roomId: 6, professorId: 10, enrolledCount: 15 }),
    slot({ scheduleId: 3, offeringId: 3, roomId: 7, professorId: 11, startTime: '11:00', endTime: '12:00' }),
  ]).pairs;
  const s = summarizeConflicts(pairs);
  eq('تعداد تداخل استاد', s.professor, 1);
  eq('تعداد تداخل سالن', s.room, 0);
  eq('استادهای درگیر', s.professorEntities, 1);
  eq('دانشجویان در معرض', s.studentsAtRisk, 35);
  const g = groupConflictsByEntity(pairs);
  eq('گروه‌بندی', g.length, 1);
  eq('نام گروه', g[0].entityName, 'استاد الف');
}

console.log(`\n${fail === 0 ? '✅ همهٔ تست‌ها گذشت' : '❌ خطا'} — ${pass} موفق، ${fail} ناموفق\n`);
if (fail > 0) process.exit(1);
