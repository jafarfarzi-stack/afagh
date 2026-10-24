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
  groupConflictPairs,
  groupConflictsByEntity,
  isExplicitlySplit,
  isMergedPair,
  isNearMergedPair,
  minutesToHm,
  NEAR_SESSION_TOLERANCE_MIN,
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

console.log('\n=== «احتمالاً یک جلسه» — تلورانسِ ۲۰ دقیقه ===');
eq('تلورانس', NEAR_SESSION_TOLERANCE_MIN, 20);
{
  // همان موردِ واقعی ۱۴۰۵۱: ۴۵۱۷۰ در سما ۱۴:۰۰–۱۶:۱۵ و بقیه ۱۳:۴۵–۱۶:۱۰، همه سالن ۶۳
  const a = slot({ scheduleId: 1, offeringId: 1, roomId: 63, startTime: '13:45', endTime: '16:10' });
  const b = slot({ scheduleId: 2, offeringId: 2, roomId: 63, startTime: '14:00', endTime: '16:15' });
  ok('اختلاف ۱۵ دقیقه در همان سالن ⇒ پیشنهاد ادغام', isNearMergedPair(a, b));
  ok('ولی ادغامِ خودکار نیست (تداخل گزارش می‌شود)', !isMergedPair(a, b));
}
{
  const a = slot({ scheduleId: 1, offeringId: 1, roomId: 63, startTime: '13:45', endTime: '16:10' });
  const b = slot({ scheduleId: 2, offeringId: 2, roomId: 65, startTime: '13:45', endTime: '16:10' });
  ok('سالنِ متفاوت ⇒ پیشنهاد ادغام نیست (تصرف دوگانهٔ فیزیکی)', !isNearMergedPair(a, b));
}
{
  const a = slot({ scheduleId: 1, offeringId: 1, roomId: 63, startTime: '08:00', endTime: '10:00' });
  const b = slot({ scheduleId: 2, offeringId: 2, roomId: 63, startTime: '09:00', endTime: '11:00' });
  ok('اختلاف یک‌ساعته ⇒ پیشنهاد ادغام نیست', !isNearMergedPair(a, b));
}
{
  const a = slot({ scheduleId: 1, offeringId: 1, roomId: 63, professorId: 10 });
  const b = slot({ scheduleId: 2, offeringId: 2, roomId: 63, professorId: 11 });
  ok('استادِ متفاوت ⇒ پیشنهاد ادغام نیست', !isNearMergedPair(a, b));
}
{
  const a = slot({ scheduleId: 1, offeringId: 1, sharedScheduleGroupKey: 'SOLO-1', startTime: '13:45' });
  const b = slot({ scheduleId: 2, offeringId: 2, startTime: '14:00' });
  ok('SOLO ⇒ حتی پیشنهاد ادغام هم نه', !isNearMergedPair(a, b));
}

console.log('\n=== گروه‌بندی: یک مسئله، نه چند ردیف ===');
{
  // پنج درسِ یک استاد در یک بازه (همان الگوی شکایتِ کاربر: «هر کدام را دوبار نشان داده»)
  const five = [
    slot({ scheduleId: 1, offeringId: 1, courseCode: '45170', startTime: '14:00', endTime: '16:15', roomId: 63 }),
    slot({ scheduleId: 2, offeringId: 2, courseCode: '71009', startTime: '13:45', endTime: '16:10', roomId: 63 }),
    slot({ scheduleId: 3, offeringId: 3, courseCode: '22109', startTime: '13:45', endTime: '16:10', roomId: 63 }),
    slot({ scheduleId: 4, offeringId: 4, courseCode: '43115', startTime: '13:45', endTime: '16:10', roomId: 63 }),
    slot({ scheduleId: 5, offeringId: 5, courseCode: '45031', startTime: '13:45', endTime: '16:10', roomId: 63 }),
  ];
  const r = detectScheduleConflicts(five);
  // ۴۵۱۷۰ هم استادِ مشترک دارد هم سالنِ مشترک ⇒ هم تداخلِ استاد هم سالن (۸ جفت)
  eq('جفت‌های خام', r.pairs.length, 8);
  eq('تداخلِ استاد', r.pairs.filter(p => p.kind === 'PROFESSOR').length, 4);
  eq('تداخلِ سالن', r.pairs.filter(p => p.kind === 'ROOM').length, 4);
  ok('همه «احتمالاً یک جلسه»', r.pairs.every(p => p.likelyMerged));
  const g = groupConflictPairs(r.pairs);
  eq('یک مسئله', g.length, 1);
  eq('پنج درس درگیر', g[0].slots.length, 5);
  eq('هشت جفت زیرِ آن', g[0].pairs.length, 8);
  eq('دو موجودیت (استاد + سالن)', g[0].entities.length, 2);
  eq('نوعِ ترکیبی', g[0].kind, 'MIXED');
  eq('پنجرهٔ کل', [g[0].windowFrom, g[0].windowTo], [825, 975]);
  eq('پرچم پیشنهاد ادغام', g[0].likelyMerged, true);
  eq('دانشجویان یکتا', g[0].students, 50);
}
{
  // دو بازهٔ جدا برای همان استاد ⇒ دو مسئله
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, startTime: '08:00', endTime: '10:00', roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 2, startTime: '08:00', endTime: '10:00', roomId: 6 }),
    slot({ scheduleId: 3, offeringId: 3, startTime: '14:00', endTime: '16:00', roomId: 5 }),
    slot({ scheduleId: 4, offeringId: 4, startTime: '14:00', endTime: '16:00', roomId: 6 }),
  ]);
  const g = groupConflictPairs(r.pairs);
  eq('دو مسئلهٔ مستقل', g.length, 2);
  eq('هر مسئله دو درس', g.map(x => x.slots.length), [2, 2]);
}
{
  // بازه‌های چسبیده (۱۰:۰۰ پایان و ۱۰:۰۰ شروع) نباید یکی شوند
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, startTime: '08:00', endTime: '10:00', roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 2, startTime: '08:00', endTime: '10:00', roomId: 6 }),
    slot({ scheduleId: 3, offeringId: 3, startTime: '09:00', endTime: '11:00', roomId: 5 }),
    slot({ scheduleId: 4, offeringId: 4, startTime: '09:00', endTime: '11:00', roomId: 6 }),
  ]);
  const g = groupConflictPairs(r.pairs);
  eq('هم‌پوشانیِ ۹–۱۰ همه را یکی می‌کند', g.length, 1);
  eq('چهار درس', g[0].slots.length, 4);
}
{
  // بررسی‌شدنِ گروه فقط وقتی است که همهٔ جفت‌هایش بررسی شده باشند
  const r = detectScheduleConflicts([
    slot({ scheduleId: 1, offeringId: 1, roomId: 5 }),
    slot({ scheduleId: 2, offeringId: 2, roomId: 6 }),
    slot({ scheduleId: 3, offeringId: 3, roomId: 7 }),
  ]);
  const fp = r.pairs[0].fingerprint;
  const g = groupConflictPairs(r.pairs, p => p.fingerprint === fp);
  eq('یک مسئله', g.length, 1);
  eq('ناقص ⇒ بررسی‌نشده', g[0].reviewed, false);
  const g2 = groupConflictPairs(r.pairs, () => true);
  eq('کامل ⇒ بررسی‌شده', g2[0].reviewed, true);
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
