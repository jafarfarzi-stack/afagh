import assert from 'node:assert/strict';
import {
  collapseMergedOfferings,
  groupIntoMerged,
  mergedDisplayTitle,
  mergedGroupKey,
  type MergeableOffering,
} from '@/lib/professor-data';
import { unitsToInt } from '@/lib/money';

console.log('— merged courses —');

assert.equal(mergedGroupKey('G1', []), 'K:G1');
assert.equal(mergedGroupKey('  G1  ', []), 'K:G1');
assert.equal(
  mergedGroupKey(null, { dayOfWeek: 1, startTime: '08:00', endTime: '10:25', roomKey: 46 }),
  'S:1|08:00|10:25|46',
);
assert.equal(
  mergedGroupKey(null, { dayOfWeek: 1, startTime: '08:00:00', endTime: '10:25:00', roomKey: 46 }),
  'S:1|08:00|10:25|46',
  'seconds must normalize away',
);
assert.equal(mergedGroupKey(null, { dayOfWeek: null, startTime: '08:00', endTime: '10:00', roomKey: 1 }), null);
assert.equal(mergedGroupKey(null, { dayOfWeek: 1, startTime: '', endTime: '10:00', roomKey: 1 }), null);
assert.equal(
  mergedGroupKey(null, [
    { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', roomKey: 5 },
    { dayOfWeek: 3, startTime: '08:00', endTime: '10:00', roomKey: 5 },
  ]),
  'S:1|08:00|10:00|5;3|08:00|10:00|5',
  'multi-session offerings join every slot',
);
assert.notEqual(
  mergedGroupKey(null, { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', roomKey: 5 }),
  mergedGroupKey(null, { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', roomKey: 6 }),
  'different rooms must never merge',
);
console.log('✓ mergedGroupKey');

const items = [
  { id: 64898, code: '23104' },
  { id: 70001, code: 'X' },
  { id: 64875, code: '14109' },
  { id: 64524, code: '54180' },
];
const keyOf = (o: { id: number }) =>
  o.id === 70001 ? null : 'S:1|08:00|10:25|46';
const groups = groupIntoMerged(items, o => o.id, keyOf);
assert.equal(groups.length, 2);
assert.equal(groups[0].merged, true);
assert.deepEqual(groups[0].memberIds, [64524, 64875, 64898]);
assert.equal(groups[0].primaryId, 64524);
assert.equal(groups[1].merged, false);
assert.equal(groups[1].primaryId, 70001);
console.log('✓ groupIntoMerged');

assert.equal(
  mergedDisplayTitle('کاربرد کامپيوتر', ['23104', '14109', '54180']),
  'کاربرد کامپيوتر (کلاس ادغامی: 23104، 14109، 54180)',
);
console.log('✓ mergedDisplayTitle');

const staff = (over: Partial<MergeableOffering> = {}): MergeableOffering => ({
  offeringId: 1,
  courseCode: '23104',
  unitsInt: unitsToInt(2),
  practicalUnits: 0,
  enrolledCount: 10,
  mergeKey: null as string | null,
  ...over,
});

const slotKey = 'S:1|08:00|10:25|46';
const slotOf = (pairs: [number, string][]) => {
  const m = new Map(pairs);
  return (id: number) => m.get(id) ?? null;
};

const merged = collapseMergedOfferings(
  [
    staff({ offeringId: 64898, courseCode: '23104', unitsInt: unitsToInt(2), enrolledCount: 10 }),
    staff({ offeringId: 64875, courseCode: '14109', unitsInt: unitsToInt(3), enrolledCount: 12 }),
  ],
  slotOf([[64898, slotKey], [64875, slotKey]]),
);
assert.equal(merged.length, 1, 'merged group must collapse to ONE entry');
assert.equal(merged[0].offeringId, 64875, 'primary = smallest offering id');
assert.equal(merged[0].unitsInt, unitsToInt(3), 'units = max of members, not sum');
assert.equal(merged[0].courseCode, '14109/23104');
assert.equal(merged[0].enrolledCount, 22, 'students summed for the crowded multiplier');
assert.deepEqual(merged[0].mergedMemberIds, [64875, 64898]);

const bySharedKey = collapseMergedOfferings(
  [
    staff({ offeringId: 11, mergeKey: 'G1' }),
    staff({ offeringId: 12, mergeKey: 'G1' }),
  ],
  slotOf([]),
);
assert.equal(bySharedKey.length, 1, 'sharedScheduleGroupKey merges even without schedules');
assert.deepEqual(bySharedKey[0].mergedMemberIds, [11, 12]);

const separate = collapseMergedOfferings(
  [
    staff({ offeringId: 64898, enrolledCount: 10 }),
    staff({ offeringId: 64875, enrolledCount: 12 }),
  ],
  slotOf([[64898, 'S:1|08:00|10:25|46'], [64875, 'S:3|08:00|10:00|46']]),
);
assert.equal(separate.length, 2, 'different slots must stay separate pay lines');
assert.equal(separate[0].mergedMemberIds, undefined);

const unscheduled = collapseMergedOfferings(
  [staff({ offeringId: 1 }), staff({ offeringId: 2 })],
  slotOf([]),
);
assert.equal(unscheduled.length, 2, 'offerings without any slot must never merge');
console.log('✓ collapseMergedOfferings (payroll counts merged as ONE)');

console.log('ALL MERGED-COURSES TESTS PASSED');
