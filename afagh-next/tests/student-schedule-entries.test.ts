import assert from 'node:assert/strict';
import {
  buildStudentCalendarEntries,
  studentStatusLabel,
  studentWeekLabel,
  type StudentScheduleCourse,
} from '../src/app/student/schedule/ScheduleClient.tsx';
import { collapseCalendarEntries } from '@/lib/professor-calendar-layout';

const course = (over: Partial<StudentScheduleCourse> = {}): StudentScheduleCourse => ({
  enrollmentId: 1,
  offeringId: 101,
  code: 'C101',
  title: 'ریاضی',
  units: 3,
  courseType: 'تخصصی',
  group: 1,
  status: 'FINALIZED',
  professor: 'استاد الف',
  enrolledCount: 25,
  capacity: 30,
  sharedScheduleGroupKey: null,
  classes: [],
  exam: null,
  ...over,
});

const cls = (over: object = {}) => ({
  dayOfWeek: 0,
  dayName: 'شنبه',
  startTime: '08:00',
  endTime: '10:00',
  room: 'A1',
  building: 'ساختمان ۱',
  weekType: 'ALL' as const,
  ...over,
});

console.log('— student schedule entries —');

const allDays = buildStudentCalendarEntries([
  course({ offeringId: 1, classes: [0, 1, 2, 3, 4, 5, 6].map(d => cls({ dayOfWeek: d })) }),
]);
assert.equal(allDays.length, 7);
assert.deepEqual(allDays.map(e => e.dayOfWeek), [0, 1, 2, 3, 4, 5, 6]);
assert.equal(new Set(allDays.map(e => e.key)).size, 7);
console.log('✓ days 0..6 each map to exactly one entry');

const badDays = buildStudentCalendarEntries([
  course({
    offeringId: 2,
    classes: [
      cls({ dayOfWeek: null }),
      cls({ dayOfWeek: 7 }),
      cls({ dayOfWeek: -1 }),
      cls({ dayOfWeek: 1.5 }),
      cls({ dayOfWeek: 3, startTime: '', endTime: '' }),
      cls({ dayOfWeek: 4, startTime: '10:00', endTime: '12:00' }),
    ],
  }),
]);
assert.equal(badDays.length, 1);
assert.equal(badDays[0].dayOfWeek, 4);
console.log('✓ null and out-of-range days plus empty times are dropped');

const parities = buildStudentCalendarEntries([
  course({ offeringId: 3, classes: [cls({ weekType: 'EVEN' }), cls({ weekType: 'ODD' }), cls({ weekType: 'ALL' })] }),
]);
assert.equal(parities.length, 3);
assert.deepEqual(parities.map(e => e.weekType), ['EVEN', 'ODD', 'ALL']);
assert.equal(new Set(parities.map(e => e.key)).size, 3);
console.log('✓ EVEN/ODD/ALL week types survive as distinct entries');

const fields = buildStudentCalendarEntries([
  course({
    offeringId: 5,
    code: 'C505',
    title: 'فیزیک',
    group: 2,
    professor: 'استاد ب',
    enrolledCount: 18,
    capacity: 40,
    classes: [cls({ room: 'B2', building: 'ساختمان ۲' }), cls({ dayOfWeek: 2, room: '', building: '' })],
  }),
])[0];
assert.equal(fields.code, 'C505');
assert.equal(fields.title, 'فیزیک');
assert.equal(fields.groupNumber, 2);
assert.equal(fields.professorName, 'استاد ب');
assert.equal(fields.roomName, 'B2');
assert.equal(fields.buildingName, 'ساختمان ۲');
assert.equal(fields.enrolledCount, 18);
assert.equal(fields.capacity, 40);
const emptyRoom = buildStudentCalendarEntries([
  course({ offeringId: 6, classes: [cls({ room: '', building: '' })] }),
])[0];
assert.equal(emptyRoom.roomName, '');
assert.equal(emptyRoom.buildingName, '');
console.log('✓ professor name, room and building map onto the shared entry');

const normed = buildStudentCalendarEntries([
  course({ offeringId: 7, classes: [cls({ startTime: '08:00:00', endTime: '10:00:00' })] }),
])[0];
assert.equal(normed.startTime, '08:00');
assert.equal(normed.endTime, '10:00');
console.log('✓ times normalize to HH:MM');

const twins = collapseCalendarEntries(
  buildStudentCalendarEntries([
    course({ offeringId: 9, enrolledCount: 18, capacity: 30, classes: [cls({ weekType: 'EVEN' }), cls({ weekType: 'ODD' })] }),
  ])
);
assert.equal(twins.length, 1);
assert.equal(twins[0].weekType, 'BOTH');
assert.equal(twins[0].code, 'C101');
assert.equal(twins[0].enrolledCount, 18);
assert.notEqual(twins[0].merged, true);
console.log('✓ student EVEN+ODD twins fit the shared collapse shape and become one BOTH entry');

const mergedPair = collapseCalendarEntries(
  buildStudentCalendarEntries([
    course({ offeringId: 11, code: 'C201', enrolledCount: 10, capacity: 20, classes: [cls()] }),
    course({ offeringId: 12, code: 'C202', enrolledCount: 12, capacity: 22, classes: [cls()] }),
  ])
);
assert.equal(mergedPair.length, 1);
assert.equal(mergedPair[0].code, 'C201 / C202');
assert.equal(mergedPair[0].merged, true);
console.log('✓ merged offerings sharing one slot collapse for students too');

assert.equal(studentWeekLabel('EVEN'), 'هفته زوج');
assert.equal(studentWeekLabel('ODD'), 'هفته فرد');
assert.equal(studentWeekLabel('ALL'), 'هر هفته');
assert.equal(studentStatusLabel('FINALIZED'), 'ثبت نهایی');
assert.equal(studentStatusLabel('REGISTERED'), 'ثبت نهایی');
assert.equal(studentStatusLabel('WAITLISTED'), 'ذخیره');
assert.equal(studentStatusLabel('PENDING_COUNCIL'), 'در انتظار شورا');
console.log('✓ week and status labels');

console.log('همهٔ تست‌های ورودی تقویمی دانشجو پاس شد.');
