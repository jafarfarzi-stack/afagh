import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra?: string) => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? `\n      ${extra}` : ''}`); }
};

const dash = read('src/app/professor/page.tsx');
console.log('dashboard waves');
check('auth wave parallel', dash.includes('Promise.all([getStaffByUser(user.id), isDemoProfessorUser(user.id)])'));
check('no sequential term filter', !dash.includes('await professorTermFilter('));
check('no sequential live classes', !dash.includes('await getTodayLiveClasses('));
check('no sequential schedule rows', !dash.includes('await professorScheduleRows('));
check('three or more Promise.all waves', (dash.match(/Promise\.all\(\[/g) ?? []).length >= 3);
check('term filter behavior kept', dash.includes('professorTermFilter(universityId)') && dash.includes('selectedTerm'));
check('demo behavior kept', dash.includes('DEMO_TERM_TITLE') && dash.includes('DEMO_DASHBOARD_CLASSES'));
check('logo fallback kept', dash.includes("getSetting('UNIVERSITY_LOGO')"));
check('no added comments', !dash.includes('// WAVE') && !dash.includes('// Wave'));

const att = read('src/app/professor/attendance/page.tsx');
console.log('attendance maps');
check('no enrollmentRows.find', !att.includes('enrollmentRows.find'));
check('no allSessions.find', !att.includes('allSessions.find'));
check('no allSessions.filter', !att.includes('allSessions.filter'));
check('no scheduleRows.filter', !att.includes('scheduleRows.filter'));
check('no scheduleRows.some', !att.includes('scheduleRows.some'));
check('no rooms.find', !att.includes('rooms.find'));
check('no allOfferings.find', !att.includes('allOfferings.find'));
check('enrollmentById map', att.includes('const enrollmentById = new Map'));
check('sessionById map', att.includes('const sessionById = new Map'));
check('sessionsByOffering map', att.includes('const sessionsByOffering = new Map'));
check('schedulesByOffering map', att.includes('const schedulesByOffering = new Map'));
check('roomById map', att.includes('const roomById = new Map'));
check('rooms scoped with limit', att.includes('fallbackRooms') && att.includes('.limit(20)'));
check('no unbounded university rooms query', !att.includes(': scheduledRooms;'));
check('demo branch kept', att.includes('demoAttendanceOfferings()') && att.includes('DEMO_ATTENDANCE_ROOMS'));
check('merged grouping kept', att.includes('groupIntoMerged(') && att.includes('mergedGroupKey'));
check('term filter kept', att.includes('professorTermFilter(universityId)'));

const actions = read('src/app/professor/grades/actions.ts');
console.log('grades revalidation');
const saveSlice = actions.slice(actions.indexOf('export async function saveGradeAction'), actions.indexOf('export async function submitTemporaryAction'));
const finalizeSlice = actions.slice(actions.indexOf('export async function finalizeSignedAction'), actions.indexOf('export async function resolveAppealAction'));
const appealSlice = actions.slice(actions.indexOf('export async function resolveAppealAction'));
check('saveGrade revalidates once', (saveSlice.match(/revalidatePath/g) ?? []).length === 1 && saveSlice.includes("revalidatePath('/professor/grades')"));
check('finalize revalidates professor grades once', (finalizeSlice.match(/revalidatePath/g) ?? []).length === 1 && finalizeSlice.includes("revalidatePath('/professor/grades')"));
check('finalize drops student revalidation', !finalizeSlice.includes("revalidatePath('/student')"));
check('finalize security kept', finalizeSlice.includes('memberOwnershipOk') && finalizeSlice.includes('inputHash') && finalizeSlice.includes('logGradeChange') && finalizeSlice.includes('FINALIZED'));
check('appeal path untouched', appealSlice.includes("revalidatePath('/professor/grades')") && appealSlice.includes("revalidatePath('/student')"));

console.log('map equivalence on synthetic data');
{
  type Sched = { offeringId: number; v: string };
  type Sess = { id: number; offeringId: number; n: number };
  const scheduleRows: Sched[] = [{ offeringId: 1, v: 'a' }, { offeringId: 2, v: 'b' }, { offeringId: 1, v: 'c' }];
  const byOffering = new Map<number, Sched[]>();
  for (const r of scheduleRows) {
    const list = byOffering.get(r.offeringId) ?? [];
    list.push(r);
    byOffering.set(r.offeringId, list);
  }
  assert.deepEqual(byOffering.get(1) ?? [], scheduleRows.filter(r => r.offeringId === 1));
  assert.deepEqual(byOffering.get(2) ?? [], scheduleRows.filter(r => r.offeringId === 2));
  assert.deepEqual(byOffering.get(9) ?? [], []);
  const sessions: Sess[] = [{ id: 10, offeringId: 1, n: 1 }, { id: 11, offeringId: 1, n: 2 }, { id: 12, offeringId: 2, n: 1 }];
  const sessById = new Map(sessions.map(s => [s.id, s] as const));
  assert.equal(sessById.get(11)?.n, sessions.find(s => s.id === 11)?.n);
  assert.equal(sessById.get(99), sessions.find(s => s.id === 99));
  const enroll = [{ id: 5, studentId: 50 }, { id: 6, studentId: 60 }];
  const enrollById = new Map(enroll.map(e => [e.id, e] as const));
  assert.equal(enrollById.get(6)?.studentId, enroll.find(e => e.id === 6)?.studentId);
  check('maps match find/filter semantics', true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
