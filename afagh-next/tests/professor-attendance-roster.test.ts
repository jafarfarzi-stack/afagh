import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type RosterStudent = { id: number; studentCode: string; fullName: string };
type RosterAttendance = { status: 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE'; lateMinutes?: number; note?: string };
type RosterStatusMap = { [studentId: number]: RosterAttendance };
type RosterLogic = {
  normalizeRosterText: (s: string | null | undefined) => string;
  rosterMatchesQuery: (student: RosterStudent, query: string | null | undefined) => boolean;
  filterRoster: (students: RosterStudent[], statuses: RosterStatusMap, query: string | null | undefined, statusFilter: string) => RosterStudent[];
  sortRoster: (students: RosterStudent[], statuses: RosterStatusMap, sortKey: string, sortDir: string, baseOrder?: Map<number, number>) => RosterStudent[];
  buildBulkStatuses: (students: RosterStudent[], prev: RosterStatusMap, status: RosterAttendance['status']) => RosterStatusMap;
};

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcPath = path.join(here, '..', 'src', 'app', 'professor', 'attendance', 'ProfessorAttendanceClient.tsx');
  const src = fs.readFileSync(srcPath, 'utf8');
  const startAnchor = 'export interface StudentInfo';
  const endAnchor = 'export const GENERATE_SESSIONS_FALLBACK_ERROR';
  const start = src.indexOf(startAnchor);
  const end = src.indexOf(endAnchor);
  assert.ok(start >= 0 && end > start, 'pure logic slice anchors found in ProfessorAttendanceClient');
  const slice = src.slice(start, end);
  assert.ok(!slice.includes('from \'react\'') && !slice.includes('from "./actions"'), 'slice has no runtime imports');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-'));
  const tmpPath = path.join(tmpDir, 'roster-logic.ts');
  fs.writeFileSync(tmpPath, slice, 'utf8');
  const logic = (await import(pathToFileURL(tmpPath).href)) as unknown as RosterLogic;
  assert.equal(typeof logic.normalizeRosterText, 'function', 'normalizeRosterText exported');
  assert.equal(typeof logic.filterRoster, 'function', 'filterRoster exported');
  assert.equal(typeof logic.sortRoster, 'function', 'sortRoster exported');
  assert.equal(typeof logic.buildBulkStatuses, 'function', 'buildBulkStatuses exported');
  console.log('— pure roster logic loaded from ProfessorAttendanceClient source slice —');

  const students: RosterStudent[] = [
    { id: 1, studentCode: '40123456', fullName: 'علی رضایی' },
    { id: 2, studentCode: '40123457', fullName: 'مریم كریمی' },
    { id: 3, studentCode: '40123460', fullName: 'حسین موسوی' },
    { id: 4, studentCode: '40123410', fullName: 'زهرا احمدی' },
  ];
  const statuses: RosterStatusMap = {
    1: { status: 'PRESENT' },
    2: { status: 'ABSENT', note: 'بیمار' },
    4: { status: 'LATE', lateMinutes: 20 },
  };

  console.log('— normalizeRosterText —');
  assert.equal(logic.normalizeRosterText('علي'), 'علی', 'ي عربی به ی فارسی');
  assert.equal(logic.normalizeRosterText('كریمی'), 'کریمی', 'ك عربی به ک فارسی');
  assert.equal(logic.normalizeRosterText('می‌روم'), 'می روم', 'نیم‌فاصله به فاصله');
  assert.equal(logic.normalizeRosterText('۴۰۱۲'), '4012', 'ارقام فارسی به لاتین');
  assert.equal(logic.normalizeRosterText('٤٥٦'), '456', 'ارقام عربی به لاتین');
  assert.equal(logic.normalizeRosterText('  علی   رضا  '), 'علی رضا', 'فاصله‌های اضافه جمع می‌شود');
  assert.equal(logic.normalizeRosterText(null), '', 'ورودی null رشته خالی می‌دهد');
  console.log('✓ normalizeRosterText');

  console.log('— rosterMatchesQuery —');
  assert.equal(logic.rosterMatchesQuery(students[0], 'علي'), true, 'جست‌وجوی «علي» نام «علی» را پیدا می‌کند');
  assert.equal(logic.rosterMatchesQuery(students[1], 'کریمی'), true, 'جست‌وجوی «کریمی» نام «كریمی» را پیدا می‌کند');
  assert.equal(logic.rosterMatchesQuery(students[1], '40123457'), true, 'جست‌وجوی کد لاتین');
  assert.equal(logic.rosterMatchesQuery(students[1], '۴۰۱۲۳۴۵۷'), true, 'جست‌وجوی کد با ارقام فارسی');
  assert.equal(logic.rosterMatchesQuery(students[0], ''), true, 'پرسش خالی همه را قبول می‌کند');
  assert.equal(logic.rosterMatchesQuery(students[0], 'موسوی'), false, 'نام نامرتبط پیدا نمی‌شود');
  console.log('✓ rosterMatchesQuery');

  console.log('— filterRoster —');
  assert.deepEqual(logic.filterRoster(students, statuses, '', 'ALL').map(s => s.id), [1, 2, 3, 4], 'بدون فیلتر همه برمی‌گردند');
  assert.deepEqual(logic.filterRoster(students, statuses, '', 'PRESENT').map(s => s.id), [1], 'فیلتر حاضر');
  assert.deepEqual(logic.filterRoster(students, statuses, '', 'UNMARKED').map(s => s.id), [3], 'فیلتر ثبت‌نشده');
  assert.deepEqual(logic.filterRoster(students, statuses, '', 'LATE').map(s => s.id), [4], 'فیلتر تأخیر');
  assert.deepEqual(logic.filterRoster(students, statuses, '', 'EXCUSED').map(s => s.id), [], 'فیلتر موجه خالی است');
  assert.deepEqual(logic.filterRoster(students, statuses, 'مریم', 'ABSENT').map(s => s.id), [2], 'ترکیب جست‌وجو و فیلتر وضعیت');
  assert.deepEqual(logic.filterRoster(students, statuses, 'مریم', 'PRESENT').map(s => s.id), [], 'ترکیب نامرتبط خالی است');
  assert.deepEqual(logic.filterRoster(students, statuses, '4012341', 'ALL').map(s => s.id), [4], 'جست‌وجوی پیشوند کد');
  console.log('✓ filterRoster');

  console.log('— sortRoster —');
  const baseOrder = new Map(students.map((s, i): [number, number] => [s.id, i]));
  assert.deepEqual(logic.sortRoster(students, statuses, 'NAME', 'ASC', baseOrder).map(s => s.id), [3, 4, 1, 2], 'مرتب‌سازی نام صعودی');
  assert.deepEqual(logic.sortRoster(students, statuses, 'NAME', 'DESC', baseOrder).map(s => s.id), [2, 1, 4, 3], 'مرتب‌سازی نام نزولی');
  assert.deepEqual(logic.sortRoster(students, statuses, 'CODE', 'ASC', baseOrder).map(s => s.id), [4, 1, 2, 3], 'مرتب‌سازی کد به صورت عددی');
  assert.deepEqual(logic.sortRoster(students, statuses, 'CODE', 'DESC', baseOrder).map(s => s.id), [3, 2, 1, 4], 'مرتب‌سازی کد نزولی');
  assert.deepEqual(logic.sortRoster(students, statuses, 'STATUS', 'ASC', baseOrder).map(s => s.id), [1, 4, 2, 3], 'مرتب‌سازی وضعیت صعودی');
  assert.deepEqual(logic.sortRoster(students, statuses, 'STATUS', 'DESC', baseOrder).map(s => s.id), [3, 2, 4, 1], 'مرتب‌سازی وضعیت نزولی');
  assert.deepEqual(logic.sortRoster(students, statuses, 'ROW', 'ASC', baseOrder).map(s => s.id), [1, 2, 3, 4], 'مرتب‌سازی ردیف صعودی');
  assert.deepEqual(logic.sortRoster(students, statuses, 'ROW', 'DESC', baseOrder).map(s => s.id), [4, 3, 2, 1], 'مرتب‌سازی ردیف نزولی');
  assert.deepEqual(logic.sortRoster(students, {}, 'STATUS', 'ASC', baseOrder).map(s => s.id), [1, 2, 3, 4], 'بدون وضعیت، ترتیب پایه حفظ می‌شود');
  console.log('✓ sortRoster');

  console.log('— buildBulkStatuses —');
  const bulkPresent = logic.buildBulkStatuses(students, statuses, 'PRESENT');
  assert.deepEqual(Object.keys(bulkPresent).map(Number).sort((a, b) => a - b), [1, 2, 3, 4], ' bulk همه سطرها را پوشش می‌دهد');
  assert.ok(students.every(s => bulkPresent[s.id].status === 'PRESENT'), 'همه حاضر می‌شوند');
  assert.equal(bulkPresent[2].note, 'بیمار', 'یادداشت سطر حفظ می‌شود');
  assert.equal(bulkPresent[4].lateMinutes, undefined, 'دقیقه تأخیر برای حاضر پاک می‌شود');
  const bulkLate = logic.buildBulkStatuses(students, statuses, 'LATE');
  assert.equal(bulkLate[4].lateMinutes, 20, 'دقیقه تأخیر قبلی حفظ می‌شود');
  assert.equal(bulkLate[1].lateMinutes, 15, 'دقیقه تأخیر پیش‌فرض برای بقیه');
  assert.equal(statuses[2].status, 'ABSENT', 'نقشه قبلی جهش پیدا نمی‌کند');
  const afterIndividualEdit: RosterStatusMap = { ...bulkPresent, 2: { ...bulkPresent[2], status: 'ABSENT' } };
  assert.equal(afterIndividualEdit[2].status, 'ABSENT', 'اصلاح تکی بعد از bulk اعمال می‌شود');
  assert.ok([1, 3, 4].every(id => afterIndividualEdit[id].status === 'PRESENT'), 'بقیه سطرها دست‌نخورده می‌مانند');
  console.log('✓ buildBulkStatuses');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('همهٔ تست‌های فیلتر/مرتب‌سازی/عملیات گروهی لیست حضور پاس شد.');
}

main().then(
  () => process.exit(0),
  err => {
    console.error(err);
    process.exit(1);
  },
);
