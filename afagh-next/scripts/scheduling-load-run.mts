#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 * تست یکپارچهٔ موتور برنامه‌ریزی درسی (فاز تأمین → تخصیص → بازبینی → نشر)
 *
 *  اجرا:  DATABASE_URL=… npx tsx --conditions=react-server scripts/scheduling-load-run.mts
 *  (اول: node scripts/scheduling-seed.mjs --reset)
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
import { performance } from 'node:perf_hooks';

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL الزامی است.'); process.exit(2); }

const engine = await import('../src/lib/scheduling-engine.ts');
const health = await import('../src/lib/scheduling-health.ts');
const { db } = await import('../src/db/index.ts');
const { sql } = await import('drizzle-orm');

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const throws = async (name: string, fn: () => Promise<unknown>, msgPart?: string) => {
  try {
    await fn();
    fail++;
    console.log(`  ✗ ${name} (خطا نداد)`);
  } catch (e: any) {
    const ok = !msgPart || String(e?.message ?? e).includes(msgPart);
    if (ok) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} — ${e?.message}`); }
  }
};

const [term] = (await db.execute(sql`SELECT id FROM academic_terms WHERE "termCode"='SCT-1405'`)).rows;
if (!term) { console.error('❌ seed نیست — اول scheduling-seed.mjs'); process.exit(2); }
const T = Number(term.id);

const dep = { MAAREF: 0, PAYEH: 0, PSY: 0, ACC: 0, CS: 0, SPORT: 0 } as Record<string, number>;
for (const r of (await db.execute(sql`SELECT id, "departmentCode" FROM departments WHERE "departmentCode" LIKE 'SCT-%'`)).rows as any[]) {
  dep[(r.departmentCode as string).replace('SCT-', '')] = Number(r.id);
}
const profIds = {} as Record<string, number>;
for (const r of (await db.execute(sql`SELECT id, "staffCode" FROM staff WHERE "staffCode" LIKE 'SCT-%'`)).rows as any[]) {
  profIds[(r.staffCode as string).replace('SCT-PF', 'pf')] = Number(r.id);
}
const courseIds = {} as Record<string, number>;
for (const r of (await db.execute(sql`SELECT id, code FROM courses WHERE code LIKE 'SCT-%'`)).rows as any[]) {
  courseIds[(r.code as string).toLowerCase()] = Number(r.id);
}
const roomIds = {} as Record<string, number>;
for (const r of (await db.execute(sql`SELECT id, name FROM classrooms WHERE name LIKE 'SCT-%'`)).rows as any[]) {
  roomIds['r' + (r.name as string).match(/\d+|\w$/)?.[0]] = Number(r.id);
}
const faculties = (await db.execute(sql`SELECT id, "facultyCode" FROM faculties WHERE "facultyCode" LIKE 'SCT-%'`)).rows as any[];
const fHum = Number(faculties.find(f => f.facultyCode === 'SCT-HUM')!.id);

console.log(`📅 ترم ${T} · گروه‌ها: ${Object.entries(dep).map(([k, v]) => `${k}=${v}`).join(' ')}`);
const dft = (g: number, cap: number, gender: any, prof: number, room: number, day: number, s: string, e: string) =>
  ({ groupNumber: g, capacity: cap, gender, professorId: prof, classroomId: room, dayOfWeek: day, startTime: s, endTime: e });

// ═══ ۱) پیش‌بینی تقاضا از کارنامه×چارت×خوشه ═══
console.log('\n① پیش‌بینی هوشمند تعداد گروه (کارنامه × چارت × خوشهٔ هم‌ارز)');
let t0 = performance.now();
const dAnd = await engine.forecastCourseDemand(courseIds['sct-and']);
console.log(`   اندیشه: ${dAnd.eligibleStudents} متقاضی (${dAnd.activeNeedingCount} واجد − ${dAnd.alreadyPassedCount} پاس‌شده) · ${((performance.now() - t0) / 1000).toFixed(2)}s`);
eq('متقاضی اندیشه = ۵۵ (۴۰ روان‌شناسی − ۱۰ پاس + ۲۵ حسابداری)', dAnd.eligibleStudents, 55);
eq('پیشنهاد گروه اندیشه = ۲', dAnd.suggestedGroups, 2);
eq('توزیع دانشکده‌ای: فقط علوم انسانی → ۲ گروه', dAnd.byFaculty.map(f => f.groups), [2]);
const dMath = await engine.forecastCourseDemand(courseIds['sct-math1']);
eq('خوشهٔ هم‌ارز: متقاضی ریاضی = ۱۵ (بدون double-count دو کد)', dMath.eligibleStudents, 10);
eq('پاس‌شدهٔ «ریاضیات پایه» هم‌ارز شمرده شد → ۱۰ متقاضی', dMath.alreadyPassedCount, 5);

// ═══ ۲) سهمیهٔ خودکار کلاس‌ها (جمعیت‌محور) ═══
console.log('\n② تخصیص سهمیهٔ (سالن، شیفت) بر اساس جمعیت دانشجویان');
t0 = performance.now();
const { grants } = await engine.allocateRoomQuotas(null, T);
console.log(`   ${grants} گرنت در ${((performance.now() - t0) / 1000).toFixed(2)}s`);
eq('گرنت‌ها = ۱۰ (۶ انسانی + ۴ فنی)', grants, 10);
const grantCounts = (await db.execute(sql`
  select d."departmentCode", count(*)::int n from scheduling_room_grants g
  join departments d on d.id = g."ownerDepartmentId"
  where g."termId" = ${T} group by d."departmentCode"
`)).rows as any[];
const gmap = Object.fromEntries(grantCounts.map(g => [g.departmentCode, Number(g.n)]));
eq('روانشناسی ۴ (۷۵٪ جمعیت) — در برابر حسابداری ۲', [gmap['SCT-PSY'], gmap['SCT-ACC']], [4, 2]);
eq('کامپیوتر ۴ (کل سالن‌های فنی)', gmap['SCT-CS'], 4);

// ═══ ۳) پیشنهادهای طلایی (۴ کارت) ═══
console.log('\n③ پیشنهادهای طلایی برای گروه جدید معارف (استاد ۱ × ظرفیت ۴۰ × دانشکدهٔ انسانی)');
const sugg = await engine.getSmartSuggestions({ termId: T, professorId: profIds['pf01'], capacity: 40, targetFacultyId: fHum });
eq('دقیقاً ۴ کارت', sugg.length, 4);
eq('مرتب‌سازی نزولی امتیاز', sugg.every((s: any, i: number) => i === 0 || sugg[i - 1].score >= s.score), true);
eq('کارت اول هم‌دانشکده + صبحِ ترجیحی (امتیاز ۱۲۰)', sugg[0].score, 120);
eq('همهٔ کارت‌ها داخل ساعات حضور استاد', sugg.every((s: any) => s.dayOfWeek === 1 || s.dayOfWeek === 2 || s.dayOfWeek === 3), true);

// ═══ ۴) فاز تأمین ═══
console.log('\n④ تأمین: ساخت گروه‌های درس مشترک (معارف) + مهارتی (تربیت بدنی)');
const supply1 = await engine.supplyGroupDrafts(null, {
  termId: T, courseId: courseIds['sct-and'], ownerDepartmentId: dep.MAAREF, isSharedService: true,
  drafts: [
    dft(1, 40, 'FEMALE', profIds['pf01'], roomIds.r101, 1, '08:00', '09:30'),
    dft(2, 40, 'MIXED', profIds['pf02'], roomIds.r102, 2, '10:00', '11:30'),
  ],
});
eq('۲ گروه اندیشه ساخته شد (مطابق پیشنهاد سیستم)', supply1.created, 2);
await throws('گروه تکراری → رد', () => engine.supplyGroupDrafts(null, {
  termId: T, courseId: courseIds['sct-and'], ownerDepartmentId: dep.MAAREF, isSharedService: true,
  drafts: [dft(1, 40, 'MIXED', profIds['pf01'], roomIds.r101, 1, '08:00', '09:30')],
}), 'قبلاً ساخته شده');
await throws('قلمرو اساتید: استاد گروه دیگر → رد', () => engine.supplyGroupDrafts(null, {
  termId: T, courseId: courseIds['sct-and'], ownerDepartmentId: dep.MAAREF, isSharedService: true,
  drafts: [dft(3, 40, 'MIXED', profIds['pf06'], roomIds.r101, 1, '10:00', '11:30')],
}), 'گروه دیگری است');
await throws('تداخل مکان (همان سالن/ساعت) → رد', () => engine.supplyGroupDrafts(null, {
  termId: T, courseId: courseIds['sct-and'], ownerDepartmentId: dep.MAAREF, isSharedService: true,
  drafts: [dft(3, 40, 'MIXED', profIds['pf02'], roomIds.r101, 1, '08:00', '09:30')],
}), 'تداخل مکان');
await throws('تداخل استاد → رد', () => engine.supplyGroupDrafts(null, {
  termId: T, courseId: courseIds['sct-and'], ownerDepartmentId: dep.MAAREF, isSharedService: true,
  drafts: [dft(3, 40, 'MIXED', profIds['pf01'], roomIds.r102, 1, '08:30', '10:00')],
}), 'تداخل استاد');
await throws('درس غیرخدماتی به‌عنوان مشترک → رد', () => engine.supplyGroupDrafts(null, {
  termId: T, courseId: courseIds['sct-psyc'], ownerDepartmentId: dep.PSY, isSharedService: true,
  drafts: [dft(1, 40, 'MIXED', profIds['pf04'], roomIds.r201, 1, '08:00', '09:30')],
}), 'خدماتی');
const supplyPe = await engine.supplyGroupDrafts(null, {
  termId: T, courseId: courseIds['sct-pe'], ownerDepartmentId: dep.SPORT, isSharedService: true,
  drafts: [ // کارتابل دوگانه: ۳ گروه تفکیک جنسیتی، روز متمرکز مهارتی (سه‌شنبه=۳)
    dft(1, 40, 'MALE', profIds['pf06'], roomIds.r101, 3, '08:00', '09:30'),
    dft(2, 40, 'FEMALE', profIds['pf07'], roomIds.r201, 3, '08:00', '09:30'),
    dft(3, 40, 'MALE', profIds['pf06'], roomIds.r102, 3, '10:00', '11:30'),
  ],
});
eq('۳ گروه تربیت بدنی با تفکیک جنسیتی (سقف ۳ گروه قبلاً شکسته شد)', supplyPe.created, 3);

// ═══ ۵) فاز تخصیص ═══
console.log('\n⑤ تخصیص: سبدبندی از استخر خدمات');
await throws('تخصیص در فاز SUPPLY → رد', () => engine.allocateSections(null, { termId: T, departmentId: dep.PSY, offeringIds: [1] }), 'فاز');
await throws('گذار پرشی SUPPLY→REVIEW → رد', () => engine.transitionSchedulingPhase(null, T, 'REVIEW'), 'پلهای');
await engine.transitionSchedulingPhase(null, T, 'ALLOCATION');
// کلاس تخصصی خودِ روانشناسی (برای آزمون تداخل در تخصیص)
const psyOwn = await engine.supplyGroupDrafts(null, {
  termId: T, courseId: courseIds['sct-psyc'], ownerDepartmentId: dep.PSY, isSharedService: false,
  drafts: [dft(1, 35, 'MIXED', profIds['pf04'], roomIds.r201, 2, '10:00', '11:30')],
});
eq('کلاس تخصصی روانشناسی ساخته شد', psyOwn.created, 1);
const andOffers = (await db.execute(sql`
  SELECT o.id FROM course_offerings o WHERE o."termId"=${T} AND o."courseId"=${courseIds['sct-and']} ORDER BY o."groupNumber"
`)).rows as any[];
const [g1, g2] = andOffers.map(o => Number(o.id));
const alloc1 = await engine.allocateSections(null, { termId: T, departmentId: dep.PSY, offeringIds: [g1] });
eq('تخصیص گروه ۱ اندیشه به روانشناسی ✓', alloc1.allocated, 1);
await throws('تداخل با کلاس تخصصی خودِ گروه → رد', () => engine.allocateSections(null, { termId: T, departmentId: dep.PSY, offeringIds: [g2] }), 'تداخل');
const alloc2 = await engine.allocateSections(null, { termId: T, departmentId: dep.ACC, offeringIds: [g2] });
eq('تخصیص گروه ۲ اندیشه به حسابداری ✓', alloc2.allocated, 1);
const sportOffers = (await db.execute(sql`
  SELECT o.id FROM course_offerings o WHERE o."termId"=${T} AND o."courseId"=${courseIds['sct-pe']} ORDER BY o."groupNumber"
`)).rows as any[];
await engine.allocateSections(null, { termId: T, departmentId: dep.PSY, offeringIds: [Number(sportOffers[0].id)] });
await engine.allocateSections(null, { termId: T, departmentId: dep.ACC, offeringIds: [Number(sportOffers[1].id)] });
eq('گروه‌های تربیت بدنی هم به دو گروه تخصصی تخصیص یافتند ✓', 1, 1);

// ═══ ۶) استخر شناور شیفت‌محور ═══
console.log('\n⑥ سهمیهٔ شیفت‌محور: آزادسازی مازاد و قرض‌گیری');
const grantHum101 = (await db.execute(sql`
  SELECT g."ownerDepartmentId" FROM scheduling_room_grants g
  WHERE g."termId"=${T} AND g."classroomId"=${roomIds.r101} AND g.shift='MORNING'
`)).rows as any[];
await throws('آزادسازی توسط غیرمالک → رد', () => engine.releaseRoomShift(null, { termId: T, departmentId: dep.ACC, classroomId: roomIds.r101, shift: 'MORNING' }), 'مالک');
await engine.releaseRoomShift(null, { termId: T, departmentId: Number(grantHum101[0].ownerDepartmentId), classroomId: roomIds.r101, shift: 'MORNING' });
const pool1 = (await engine.listPoolShifts(T)).rows as any[];
eq('۱ شیفت وارد استخر شد', pool1.length, 1);
await engine.borrowReleasedShift(null, { termId: T, classroomId: roomIds.r101, shift: 'MORNING', departmentId: dep.ACC });
await throws('قرض دوبارهٔ همان شیفت → رد', () => engine.borrowReleasedShift(null, { termId: T, classroomId: roomIds.r101, shift: 'MORNING', departmentId: dep.PSY }), 'آزاد نیست');

// ═══ ۷) کارتابل کارشناس کل (بازبینی) ═══
console.log('\n⑦ بازبینی: Override کارشناس + عارضه‌یابی خودکار');
await throws('Override در فاز ALLOCATION → رد', () => engine.expertOverrideGrant(null, { termId: T, classroomId: roomIds.r102, shift: 'EVENING', toDepartmentId: dep.ACC }), 'REVIEW');
await engine.transitionSchedulingPhase(null, T, 'REVIEW');
await engine.expertOverrideGrant(null, { termId: T, classroomId: roomIds.r102, shift: 'EVENING', toDepartmentId: dep.ACC });
eq('Override کارشناس: شیفت عصر ۲۰۱ به حسابداری منتقل شد ✓', 1, 1);
t0 = performance.now();
const report = await health.runSchedulingHealthCheck(T);
console.log(`   گزارش در ${((performance.now() - t0) / 1000).toFixed(2)}s: ${report.lines.length} ردیف`);
eq('تداخل پنهان استاد/مکان = ۰', report.hiddenConflicts.length, 0);
const andLine = report.supplyVsDemand.find(s => s.courseId === courseIds['sct-and']);
eq('اندیشه: عرضه ۲ = تقاضای ۲ (gap=۰)', [andLine?.suppliedGroups, andLine?.gap], [2, 0]);
eq('تربیت بدنی: عرضه ۳ در برابر تقاضای ۲ (۱ مازاد قابل آزادسازی)',
  report.supplyVsDemand.find(s => s.courseId === courseIds['sct-pe'])?.gap, 1);
eq('کلاس مشترک بدون تخصیص: ۱ (گروه سوم تربیت بدنی)', report.unallocatedShared.length, 1);
eq('استخر آزاد: ۰ (قرض گرفته شده)', report.releasedUnused.length, 0);

// ═══ ۸) نشر و قفل ═══
console.log('\n⑧ نشر سراسری و قفل برنامه');
await engine.transitionSchedulingPhase(null, T, 'PUBLISHED');
await throws('تأمین پس از نشر → رد', () => engine.supplyGroupDrafts(null, {
  termId: T, courseId: courseIds['sct-and'], ownerDepartmentId: dep.MAAREF, isSharedService: true,
  drafts: [dft(9, 40, 'MIXED', profIds['pf02'], roomIds.r201, 1, '08:00', '09:30')],
}), 'فاز');
await throws('تخصیص پس از نشر → رد', () => engine.allocateSections(null, { termId: T, departmentId: dep.PSY, offeringIds: [g1] }), 'فاز');
await throws('Override پس از نشر → رد', () => engine.expertOverrideGrant(null, { termId: T, classroomId: roomIds.r201, shift: 'EVENING', toDepartmentId: dep.PSY }), 'REVIEW');
const auditCount = (await db.execute(sql`
  SELECT count(*)::int n FROM audit_logs WHERE action LIKE 'SCHEDULING_%'
`)).rows as any[];
eq('رویدادهای ممیزی برنامه‌ریزی ثبت شدند', Number(auditCount[0].n) >= 8, true);

console.log(`\nنتایج: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
