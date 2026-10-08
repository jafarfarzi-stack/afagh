import assert from 'node:assert/strict';
import {
  PROFESSOR_CALENDAR_DAY_COUNT,
  PROFESSOR_CALENDAR_END_MINUTES,
  PROFESSOR_CALENDAR_START_MINUTES,
  collapseCalendarEntries,
  filterProfessorCalendarByWeek,
  groupIntoMerged,
  layoutProfessorCalendarDay,
  layoutProfessorCalendarWeek,
  mergedGroupKey,
  professorCalendarDayIndex,
  professorCalendarEntryKey,
  professorCalendarHourLabels,
  professorCalendarTimeToMinutes,
  type ProfessorCalendarCollapseRow,
  type ProfessorCalendarSchedulable,
} from '@/lib/professor-calendar-layout';

const row = (over: Partial<ProfessorCalendarSchedulable> = {}): ProfessorCalendarSchedulable => ({
  id: 1,
  dayOfWeek: 0,
  startTime: '08:00',
  endTime: '10:00',
  weekType: 'ALL',
  ...over,
});

console.log('— professor calendar layout —');

assert.equal(PROFESSOR_CALENDAR_START_MINUTES, 480);
assert.equal(PROFESSOR_CALENDAR_END_MINUTES, 1200);
assert.equal(PROFESSOR_CALENDAR_DAY_COUNT, 7);

assert.equal(professorCalendarTimeToMinutes('08:00'), 480);
assert.equal(professorCalendarTimeToMinutes('14:40'), 880);
assert.equal(professorCalendarTimeToMinutes('16:20'), 980);
assert.equal(professorCalendarTimeToMinutes('09:40'), 580);
assert.equal(professorCalendarTimeToMinutes('8:00'), 480);
assert.equal(professorCalendarTimeToMinutes('08:00:00'), 480);
assert.equal(professorCalendarTimeToMinutes(''), null);
assert.equal(professorCalendarTimeToMinutes('bad'), null);
assert.equal(professorCalendarTimeToMinutes('24:00'), null);
assert.equal(professorCalendarTimeToMinutes('10:99'), null);
console.log('✓ time parsing');

assert.equal(professorCalendarDayIndex(0), 0);
assert.equal(professorCalendarDayIndex(6), 6);
assert.equal(professorCalendarDayIndex(null), null);
assert.equal(professorCalendarDayIndex(7), null);
assert.equal(professorCalendarDayIndex(8), null);
assert.equal(professorCalendarDayIndex(-1), null);
assert.equal(professorCalendarDayIndex(1.5), null);
console.log('✓ day mapping is 0-based Saturday..Friday (0..6), Friday is a real column');

const labels = professorCalendarHourLabels();
assert.equal(labels.length, 13);
assert.equal(labels[0], '08:00');
assert.equal(labels[12], '20:00');
console.log('✓ hour labels 08:00..20:00');

const placed1440 = layoutProfessorCalendarDay([row({ startTime: '14:40', endTime: '16:20' })]);
assert.equal(placed1440.length, 1);
assert.equal(placed1440[0].topPercent, 55.56);
assert.equal(placed1440[0].heightPercent, 13.89);
assert.equal(placed1440[0].leftPercent, 0);
assert.equal(placed1440[0].widthPercent, 100);
assert.equal(placed1440[0].columnCount, 1);
assert.equal(placed1440[0].clipped, false);
const tricky = [
  row({ id: 11, startTime: '14:40', endTime: '16:20' }),
  row({ id: 12, startTime: '09:40', endTime: '11:10' }),
  row({ id: 13, startTime: '13:00', endTime: '14:30' }),
  row({ id: 14, startTime: '16:20', endTime: '17:50' }),
  row({ id: 15, startTime: '18:00', endTime: '19:30' }),
];
const placedTricky = layoutProfessorCalendarDay(tricky);
assert.equal(placedTricky.length, 5);
assert.equal(new Set(placedTricky.map(p => p.key)).size, 5);
for (const p of placedTricky) assert.equal(p.columnCount, 1);
console.log('✓ every class rendered exactly once at its real offset, no slot duplication');

const overlap = layoutProfessorCalendarDay([
  row({ id: 21, startTime: '10:00', endTime: '12:00' }),
  row({ id: 22, startTime: '11:00', endTime: '13:00' }),
]);
assert.equal(overlap.length, 2);
assert.ok(overlap.every(p => p.columnCount === 2));
assert.ok(overlap.every(p => p.widthPercent === 50));
assert.notEqual(overlap[0].column, overlap[1].column);
assert.notEqual(overlap[0].leftPercent, overlap[1].leftPercent);
const touching = layoutProfessorCalendarDay([
  row({ id: 31, startTime: '08:00', endTime: '10:00' }),
  row({ id: 32, startTime: '10:00', endTime: '12:00' }),
]);
assert.ok(touching.every(p => p.columnCount === 1 && p.widthPercent === 100));
const triple = layoutProfessorCalendarDay([
  row({ id: 41, startTime: '08:00', endTime: '12:00' }),
  row({ id: 42, startTime: '09:00', endTime: '10:00' }),
  row({ id: 43, startTime: '09:30', endTime: '11:00' }),
]);
assert.ok(triple.every(p => p.columnCount === 3 && p.widthPercent === 33.33));
assert.equal(new Set(triple.map(p => p.column)).size, 3);
const separateDays = layoutProfessorCalendarWeek([
  row({ id: 51, dayOfWeek: 0, startTime: '10:00', endTime: '12:00' }),
  row({ id: 52, dayOfWeek: 0, startTime: '11:00', endTime: '13:00' }),
  row({ id: 53, dayOfWeek: 6, startTime: '10:00', endTime: '12:00' }),
]);
assert.equal(separateDays.get(0)!.length, 2);
assert.equal(separateDays.get(6)!.length, 1);
assert.equal(separateDays.get(6)![0].widthPercent, 100);
assert.equal(separateDays.get(3)!.length, 0);
console.log('✓ same-day overlaps share the column side-by-side, Friday included');

assert.notEqual(
  professorCalendarEntryKey(row({ id: 61, weekType: 'EVEN' })),
  professorCalendarEntryKey(row({ id: 61, weekType: 'ODD' })),
);
const evenOdd = layoutProfessorCalendarDay([
  row({ id: 61, weekType: 'EVEN', startTime: '13:00', endTime: '15:00' }),
  row({ id: 61, weekType: 'ODD', startTime: '13:00', endTime: '15:00' }),
]);
assert.equal(evenOdd.length, 2);
assert.ok(evenOdd.every(p => p.columnCount === 2));
console.log('✓ EVEN and ODD rows are two distinct entries');

const weekRows = [row({ id: 71, weekType: 'EVEN' }), row({ id: 72, weekType: 'ODD' }), row({ id: 73, weekType: 'ALL' })];
assert.equal(filterProfessorCalendarByWeek(weekRows, 'ALL').length, 3);
assert.deepEqual(filterProfessorCalendarByWeek(weekRows, 'EVEN').map(r => r.id), [71, 73]);
assert.deepEqual(filterProfessorCalendarByWeek(weekRows, 'ODD').map(r => r.id), [72, 73]);
console.log('✓ week filter keeps ALL plus the selected parity');

const early = layoutProfessorCalendarDay([row({ startTime: '07:00', endTime: '08:30' })])[0];
assert.equal(early.topPercent, 0);
assert.equal(early.clipped, true);
const late = layoutProfessorCalendarDay([row({ startTime: '19:00', endTime: '21:00' })])[0];
assert.ok(late.topPercent + late.heightPercent <= 100);
assert.equal(late.clipped, true);
const short = layoutProfessorCalendarDay([row({ startTime: '10:00', endTime: '10:15' })])[0];
assert.ok(short.heightPercent >= (30 / 720) * 100);
assert.equal(layoutProfessorCalendarDay([row({ startTime: '10:00', endTime: '10:00' })]).length, 0);
assert.equal(layoutProfessorCalendarDay([row({ startTime: '', endTime: '' })]).length, 0);
console.log('✓ out-of-range times clamp, short classes keep a minimum height, invalid rows drop');

console.log('\nهمهٔ تست‌های چیدمان تقویمی استاد پاس شد.');

const crow = (over: Partial<ProfessorCalendarCollapseRow> = {}): ProfessorCalendarCollapseRow => ({
  id: 1,
  code: 'C101',
  title: 'فیزیک',
  groupNumber: 1,
  units: 3,
  enrolledCount: 20,
  capacity: 30,
  dayOfWeek: 0,
  startTime: '08:00',
  endTime: '10:00',
  roomName: 'A1',
  buildingName: '',
  weekType: 'ALL',
  ...over,
});

assert.equal(mergedGroupKey('G1', { dayOfWeek: 0, startTime: '08:00', endTime: '10:00', roomKey: 'A1' }), 'K:G1');
assert.equal(
  mergedGroupKey(null, { dayOfWeek: 0, startTime: '08:00', endTime: '10:00', roomKey: 'A1' }),
  'S:0|08:00|10:00|A1',
);
assert.equal(mergedGroupKey(null, { dayOfWeek: null, startTime: '', endTime: '' }), null);
const gchk = groupIntoMerged([{ id: 1 }, { id: 2 }], x => x.id, () => 'K:G');
assert.equal(gchk.length, 1);
assert.equal(gchk[0].merged, true);
console.log('✓ merge helpers live in the client-safe layout module');

const mergedTwo = collapseCalendarEntries([
  crow({ id: 1, code: 'C101', title: 'فیزیک', enrolledCount: 20, capacity: 30, units: 3 }),
  crow({ id: 2, code: 'C102', title: 'فیزیک', enrolledCount: 15, capacity: 25, units: 2 }),
]);
assert.equal(mergedTwo.length, 1);
assert.equal(mergedTwo[0].code, 'C101 / C102');
assert.equal(mergedTwo[0].title, 'فیزیک');
assert.equal(mergedTwo[0].enrolledCount, 35);
assert.equal(mergedTwo[0].capacity, 30);
assert.equal(mergedTwo[0].units, 3);
assert.equal(mergedTwo[0].merged, true);
assert.equal(mergedTwo[0].weekType, 'ALL');
assert.equal(mergedTwo[0].dayOfWeek, 0);
assert.equal(mergedTwo[0].startTime, '08:00');
const mergedKeyed = collapseCalendarEntries([
  crow({ id: 3, code: 'C201', sharedScheduleGroupKey: 'G1', dayOfWeek: 1, startTime: '10:00', endTime: '12:00', roomName: 'B2', enrolledCount: 10, capacity: 20 }),
  crow({ id: 4, code: 'C202', sharedScheduleGroupKey: 'G1', dayOfWeek: 1, startTime: '10:00', endTime: '12:00', roomName: 'B2', enrolledCount: 12, capacity: 22 }),
]);
assert.equal(mergedKeyed.length, 1);
assert.equal(mergedKeyed[0].code, 'C201 / C202');
assert.equal(mergedKeyed[0].enrolledCount, 22);
assert.equal(mergedKeyed[0].merged, true);
console.log('✓ merged members at one slot collapse to a single entry with joined codes and summed enrollment');

const twins = collapseCalendarEntries([
  crow({ id: 7, code: 'C301', weekType: 'EVEN', enrolledCount: 18, capacity: 30 }),
  crow({ id: 7, code: 'C301', weekType: 'ODD', enrolledCount: 18, capacity: 30 }),
]);
assert.equal(twins.length, 1);
assert.equal(twins[0].weekType, 'BOTH');
assert.equal(twins[0].code, 'C301');
assert.equal(twins[0].enrolledCount, 18);
assert.notEqual(twins[0].merged, true);
console.log('✓ EVEN+ODD twins collapse to one BOTH entry without doubling enrollment');

const overlapDiff = collapseCalendarEntries([
  crow({ id: 11, code: 'C401', startTime: '10:00', endTime: '12:00' }),
  crow({ id: 12, code: 'C402', startTime: '11:00', endTime: '13:00' }),
]);
assert.equal(overlapDiff.length, 2);
assert.deepEqual(
  overlapDiff.map(r => r.code).sort(),
  ['C401', 'C402'],
);
const placedDiff = layoutProfessorCalendarDay(overlapDiff);
assert.ok(placedDiff.every(p => p.columnCount === 2));
const sessionsKept = collapseCalendarEntries([
  crow({ id: 21, code: 'C501', sharedScheduleGroupKey: 'G9', dayOfWeek: 0, startTime: '08:00', endTime: '10:00', roomName: 'A1' }),
  crow({ id: 22, code: 'C502', sharedScheduleGroupKey: 'G9', dayOfWeek: 2, startTime: '08:00', endTime: '10:00', roomName: 'A1' }),
]);
assert.equal(sessionsKept.length, 2);
const twoSessions = collapseCalendarEntries([
  crow({ id: 31, dayOfWeek: 0, startTime: '08:00', endTime: '10:00' }),
  crow({ id: 31, dayOfWeek: 2, startTime: '08:00', endTime: '10:00' }),
]);
assert.equal(twoSessions.length, 2);
console.log('✓ genuinely different or separate-session rows stay split and keep side-by-side layout');

const bothRows = [
  crow({ id: 41, weekType: 'BOTH' }),
  crow({ id: 42, weekType: 'EVEN' }),
  crow({ id: 43, weekType: 'ODD' }),
  crow({ id: 44, weekType: 'ALL' }),
];
assert.deepEqual(filterProfessorCalendarByWeek(bothRows, 'ALL').map(r => r.id), [41, 42, 43, 44]);
assert.deepEqual(filterProfessorCalendarByWeek(bothRows, 'EVEN').map(r => r.id), [41, 42, 44]);
assert.deepEqual(filterProfessorCalendarByWeek(bothRows, 'ODD').map(r => r.id), [41, 43, 44]);
console.log('✓ BOTH entries stay visible under EVEN and ODD filters');

const solo = collapseCalendarEntries([
  crow({ id: 51, code: 'C601', dayOfWeek: 0, startTime: '08:00', endTime: '10:00' }),
  crow({ id: 52, code: 'C602', dayOfWeek: 1, startTime: '10:00', endTime: '12:00' }),
]);
assert.equal(solo.length, 2);
assert.equal(solo[0].code, 'C601');
assert.equal(solo[1].code, 'C602');
const placedSolo = layoutProfessorCalendarWeek(solo);
assert.equal(placedSolo.get(0)!.length, 1);
assert.equal(placedSolo.get(0)![0].columnCount, 1);
assert.equal(placedSolo.get(1)!.length, 1);
console.log('✓ genuine non-overlapping classes are unaffected');

console.log('\nهمهٔ تست‌های ادغام تقویمی استاد پاس شد.');
