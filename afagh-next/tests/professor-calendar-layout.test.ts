import assert from 'node:assert/strict';
import {
  PROFESSOR_CALENDAR_DAY_COUNT,
  PROFESSOR_CALENDAR_END_MINUTES,
  PROFESSOR_CALENDAR_START_MINUTES,
  filterProfessorCalendarByWeek,
  layoutProfessorCalendarDay,
  layoutProfessorCalendarWeek,
  professorCalendarDayIndex,
  professorCalendarEntryKey,
  professorCalendarHourLabels,
  professorCalendarTimeToMinutes,
  type ProfessorCalendarSchedulable,
} from '@/lib/professor-calendar-layout';

const row = (over: Partial<ProfessorCalendarSchedulable> = {}): ProfessorCalendarSchedulable => ({
  id: 1,
  dayOfWeek: 1,
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

assert.equal(professorCalendarDayIndex(1), 0);
assert.equal(professorCalendarDayIndex(7), 6);
assert.equal(professorCalendarDayIndex(null), null);
assert.equal(professorCalendarDayIndex(0), null);
assert.equal(professorCalendarDayIndex(8), null);
assert.equal(professorCalendarDayIndex(-1), null);
assert.equal(professorCalendarDayIndex(1.5), null);
console.log('✓ day mapping is 1-based Saturday..Friday (1..7), Friday is a real column');

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
  row({ id: 51, dayOfWeek: 1, startTime: '10:00', endTime: '12:00' }),
  row({ id: 52, dayOfWeek: 1, startTime: '11:00', endTime: '13:00' }),
  row({ id: 53, dayOfWeek: 7, startTime: '10:00', endTime: '12:00' }),
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
