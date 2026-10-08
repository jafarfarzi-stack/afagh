import assert from 'node:assert/strict';
import {
  buildDashboardScheduleMap,
  buildProfNameMap,
  distinctIds,
  resolveDashboardTerm,
  toShamsi,
} from '../src/lib/student-dashboard-helpers.ts';

console.log('— student dashboard helpers —');

assert.equal(toShamsi(null), '—');
assert.equal(toShamsi(undefined), '—');
assert.equal(toShamsi(''), '—');
assert.equal(toShamsi('1403/07/15'), '1403/07/15');
assert.equal(toShamsi('1399-06-01'), '1399-06-01');
assert.equal(toShamsi('not-a-date'), 'not-a-date');
const gregorian = toShamsi('2026-01-05T00:00:00.000Z');
assert.match(gregorian, /۱۴۰۴/);
console.log('✓ toShamsi keeps shamsi strings, passes through garbage, formats gregorian');

const profs = buildProfNameMap([
  { staffId: 7, firstName: 'علی', lastName: 'رضایی' },
  { staffId: 9, firstName: null, lastName: 'کاظمی' },
  { staffId: 11, firstName: null, lastName: null },
]);
assert.equal(profs.get(7), 'علی رضایی');
assert.equal(profs.get(9), 'کاظمی');
assert.equal(profs.get(11), '');
assert.equal(profs.get(999), undefined);
assert.equal(buildProfNameMap([]).size, 0);
console.log('✓ buildProfNameMap matches the inline `${first} ${last}`.trim() behaviour');

const sched = buildDashboardScheduleMap([
  { offeringId: 1, scheduleType: 'CLASS', dayOfWeek: 0, examDate: null, startTime: '08:00:00', endTime: '10:00:00', roomName: 'A1', buildingName: 'ساختمان ۱' },
  { offeringId: 1, scheduleType: 'EXAM', dayOfWeek: null, examDate: '1403-03-20', startTime: '09:00:00', endTime: '11:00:00', roomName: null, buildingName: null },
  { offeringId: 2, scheduleType: 'CLASS', dayOfWeek: null, examDate: null, startTime: '08:00', endTime: '10:00', roomName: 'B1', buildingName: null },
  { offeringId: 2, scheduleType: 'EXAM', dayOfWeek: null, examDate: null, startTime: '09:00', endTime: '11:00', roomName: null, buildingName: null },
  { offeringId: 3, scheduleType: 'OTHER', dayOfWeek: 1, examDate: null, startTime: '08:00', endTime: '10:00', roomName: 'C1', buildingName: null },
]);
const e1 = sched.get(1)!;
assert.equal(e1.classes.length, 1);
assert.equal(e1.classes[0].dayName, 'شنبه');
assert.equal(e1.classes[0].startTime, '08:00');
assert.equal(e1.classes[0].room, 'A1');
assert.equal(e1.classes[0].building, 'ساختمان ۱');
assert.equal(e1.exam?.examDate, '1403-03-20');
assert.equal(e1.exam?.room, 'سالن امتحانات مرکزی');
const e2 = sched.get(2)!;
assert.equal(e2.classes.length, 0);
assert.equal(e2.exam, undefined);
assert.equal(sched.get(999), undefined);
assert.equal(buildDashboardScheduleMap([]).size, 0);
const fallbackRoom = buildDashboardScheduleMap([
  { offeringId: 5, scheduleType: 'CLASS', dayOfWeek: 6, examDate: null, startTime: '10:00', endTime: '12:00', roomName: null, buildingName: null },
]).get(5)!;
assert.equal(fallbackRoom.classes[0].dayName, 'جمعه');
assert.equal(fallbackRoom.classes[0].room, 'کلاس تئوری');
assert.equal(fallbackRoom.classes[0].building, undefined);
console.log('✓ buildDashboardScheduleMap keeps class/exam shapes, fallbacks and slicing');

const terms = [
  { id: 10, title: 'نیمسال اول ۱۴۰۳' },
  { id: 20, title: 'نیمسال دوم ۱۴۰۳' },
];
assert.deepEqual(resolveDashboardTerm({ terms, selectedId: 20, effectiveId: 10 }), {
  filteredTerm: { id: 20, title: 'نیمسال دوم ۱۴۰۳' },
  term: { id: 20, title: 'نیمسال دوم ۱۴۰۳' },
});
assert.deepEqual(resolveDashboardTerm({ terms, selectedId: null, effectiveId: 10 }), {
  filteredTerm: null,
  term: { id: 10, title: 'نیمسال اول ۱۴۰۳' },
});
assert.deepEqual(resolveDashboardTerm({ terms, selectedId: 999, effectiveId: 10 }), {
  filteredTerm: null,
  term: { id: 10, title: 'نیمسال اول ۱۴۰۳' },
});
assert.deepEqual(resolveDashboardTerm({ terms, selectedId: null, effectiveId: null }), {
  filteredTerm: null,
  term: null,
});
assert.deepEqual(resolveDashboardTerm({ terms: [], selectedId: null, effectiveId: null }), {
  filteredTerm: null,
  term: null,
});
console.log('✓ resolveDashboardTerm prefers the cookie term, else the effective term, else null');

assert.deepEqual(distinctIds([1, 2, 2, null, undefined, 3, 1]), [1, 2, 3]);
assert.deepEqual(distinctIds([]), []);
assert.deepEqual(distinctIds([null, undefined]), []);
console.log('✓ distinctIds dedupes offering/professor id lists for inArray scoping');

console.log('همهٔ تست‌های هلپر داشبورد دانشجو پاس شد.');
