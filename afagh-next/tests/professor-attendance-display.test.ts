import assert from 'node:assert/strict';
import {
  dayOfWeekToName,
  formatScheduleLabel,
  mergeRefreshedOfferings,
  weekTypeLabel,
} from '@/lib/professor-attendance-display';

console.log('— professor attendance display —');

assert.equal(dayOfWeekToName(0), 'شنبه');
assert.equal(dayOfWeekToName(1), 'یکشنبه');
assert.equal(dayOfWeekToName(2), 'دوشنبه');
assert.equal(dayOfWeekToName(3), 'سه‌شنبه');
assert.equal(dayOfWeekToName(4), 'چهارشنبه');
assert.equal(dayOfWeekToName(5), 'پنج‌شنبه');
assert.equal(dayOfWeekToName(6), 'جمعه');
assert.equal(dayOfWeekToName(7), '');
assert.equal(dayOfWeekToName(8), '');
assert.equal(dayOfWeekToName(-1), '');
assert.equal(dayOfWeekToName(null), '');
assert.equal(dayOfWeekToName(undefined), '');
console.log('✓ dayOfWeekToName');

assert.equal(weekTypeLabel('ALL'), 'هر هفته');
assert.equal(weekTypeLabel('CLASS'), 'هر هفته');
assert.equal(weekTypeLabel(null), 'هر هفته');
assert.equal(weekTypeLabel('EVEN'), 'هفته زوج');
assert.equal(weekTypeLabel('ODD'), 'هفته فرد');
console.log('✓ weekTypeLabel');

assert.equal(
  formatScheduleLabel([{ dayOfWeek: 0, startTime: '08:00', endTime: '10:00', scheduleType: 'CLASS' }]),
  'شنبه‌ها 08:00 الی 10:00',
);
assert.equal(
  formatScheduleLabel([
    { dayOfWeek: 1, startTime: '10:00:00', endTime: '12:00:00', scheduleType: 'EVEN' },
    { dayOfWeek: 3, startTime: '13:30', endTime: '15:30', scheduleType: 'ODD' },
  ]),
  'یکشنبه‌ها 10:00 الی 12:00 (هفته زوج)؛ سه‌شنبه‌ها 13:30 الی 15:30 (هفته فرد)',
);
assert.equal(formatScheduleLabel([{ dayOfWeek: 5, startTime: '08:00', endTime: '10:00', scheduleType: 'CLASS' }]).slice(0, 8), 'پنج‌شنبه');
assert.equal(formatScheduleLabel([]), 'زمان کلاس ثبت نشده');
assert.equal(formatScheduleLabel([{ dayOfWeek: null, startTime: '08:00', endTime: '10:00' }]), 'زمان کلاس ثبت نشده');
console.log('✓ formatScheduleLabel');

const prev = [
  { id: 1, sessions: [] as number[], tag: 'old' },
  { id: 2, sessions: [7], tag: 'old' },
];
const fresh = [
  { id: 1, sessions: [1, 2], tag: 'new' },
  { id: 2, sessions: [7, 8], tag: 'new' },
  { id: 3, sessions: [9], tag: 'new' },
];
const merged = mergeRefreshedOfferings(prev, fresh);
assert.equal(merged.find(o => o.id === 1)?.tag, 'new', 'empty sessions get refreshed');
assert.equal(merged.find(o => o.id === 2)?.tag, 'old', 'non-empty sessions keep local edits');
assert.equal(merged.find(o => o.id === 3)?.tag, 'new', 'unknown offerings are appended');
assert.equal(merged.length, 3);
const stillEmpty = mergeRefreshedOfferings(prev, [{ id: 1, sessions: [], tag: 'new' }]);
assert.equal(stillEmpty.find(o => o.id === 1)?.tag, 'old', 'no clobber when fresh is still empty');
console.log('✓ mergeRefreshedOfferings');

console.log('\nهمهٔ تست‌های نمایش حضوروغیاب استاد پاس شد.');
