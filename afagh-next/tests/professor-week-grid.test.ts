import assert from 'node:assert/strict';
import {
  PROFESSOR_GRID_DAYS,
  PROFESSOR_GRID_TIME_SLOTS,
  hasProfessorSchedule,
  professorRangeMatch,
} from '@/lib/professor-week-grid';
import { JALALI_DAY_NAMES, professorUniqueOfferings } from '@/lib/professor-data';

const row = (over: Partial<Parameters<typeof hasProfessorSchedule>[0]> = {}) => ({
  dayOfWeek: 0,
  startTime: '08:00',
  endTime: '10:00',
  ...over,
});

console.log('— professor week grid —');
assert.equal(PROFESSOR_GRID_DAYS.length, 7, 'grid must cover Saturday..Friday');
assert.equal(JALALI_DAY_NAMES[0], 'شنبه', 'Saturday class (day 0) labels شنبه');
assert.equal(JALALI_DAY_NAMES[6], 'جمعه', 'Friday class (day 6) labels جمعه');
assert.equal(PROFESSOR_GRID_DAYS[6], 'جمعه');
assert.equal(PROFESSOR_GRID_TIME_SLOTS.length, 5);

assert.equal(hasProfessorSchedule(row()), true);
assert.equal(hasProfessorSchedule(row({ dayOfWeek: 0 })), true, 'Saturday (day 0) is a real class day');
assert.equal(hasProfessorSchedule(row({ dayOfWeek: 6 })), true, 'Friday (day 6) is a real class day');
assert.equal(hasProfessorSchedule(row({ dayOfWeek: 7 })), false, 'day 7 is invalid in the 0-based convention');
assert.equal(hasProfessorSchedule(row({ dayOfWeek: -1 })), false, 'day -1 is invalid');
assert.equal(hasProfessorSchedule(row({ dayOfWeek: null })), false);
assert.equal(hasProfessorSchedule(row({ startTime: '' })), false);
assert.equal(hasProfessorSchedule(row({ endTime: '' })), false);
assert.equal(hasProfessorSchedule(row({ startTime: '10:00', endTime: '10:00' })), false);
assert.equal(hasProfessorSchedule(row({ startTime: 'bad', endTime: '10:00' })), false);
console.log('✓ hasProfessorSchedule');

assert.deepEqual(professorRangeMatch('08:00', '10:00').slotIds, [1]);
assert.deepEqual(professorRangeMatch('09:40', '11:10').slotIds, [1, 2], 'overlap, not containment');
assert.deepEqual(professorRangeMatch('13:00', '14:30').slotIds, [3], '13:00-14:30 must be visible');
assert.deepEqual(professorRangeMatch('14:40', '16:10').slotIds, [3, 4]);
assert.deepEqual(professorRangeMatch('16:20', '17:50').slotIds, [4, 5]);
assert.deepEqual(professorRangeMatch('18:00', '19:30').slotIds, [5]);
assert.deepEqual(professorRangeMatch('11:20', '12:50').slotIds, [2]);
assert.deepEqual(professorRangeMatch('08:45', '09:30').slotIds, [1]);
assert.deepEqual(professorRangeMatch('09:40', '12:00').slotIds, [1, 2]);
assert.equal(professorRangeMatch('01:00', '01:01').outsideStandardSlots, true);
assert.equal(professorRangeMatch('01:00', '01:01').slotIds.length, 0);
assert.equal(professorRangeMatch('09:40', '11:10').outsideStandardSlots, false);
console.log('✓ professorRangeMatch');

const many: Array<{ dayOfWeek: number | null; startTime: string; endTime: string } & { id: number }> = [
  { id: 1, dayOfWeek: 0, startTime: '08:00', endTime: '10:00' },
  { id: 1, dayOfWeek: 2, startTime: '10:00', endTime: '12:00' },
  { id: 2, dayOfWeek: null, startTime: '', endTime: '' },
  { id: 2, dayOfWeek: null, startTime: '', endTime: '' },
];
assert.equal(professorUniqueOfferings(many as never).length, 2, 'one row per offering');
console.log('✓ professorUniqueOfferings');

console.log('\nهمهٔ تست‌های جدول هفتگی استاد پاس شد.');
