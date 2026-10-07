import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { departments, professor_term_contracts } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import ProfessorAvailabilityClient from './ProfessorAvailabilityClient';
import { currentTermFor, termsFor } from '@/lib/terms';
import { isDemoProfessorUser } from '@/lib/demo-accounts';
import {
  DEMO_ACADEMIC_RANK,
  DEMO_AVAILABILITY_TERM,
  DEMO_CONTRACT_TYPE,
  DEMO_DEPARTMENT_NAME,
  DEMO_UNIVERSITY_ID,
} from '@/lib/demo-professor-data';

export const dynamic = 'force-dynamic';

export default async function ProfessorAvailabilityPage() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);

  if (!me) {
    return (
      <div className="card text-center p-8">
        <p className="text-slate-600 font-bold">پروندهٔ هیئت علمی یافت نشد.</p>
      </div>
    );
  }

  const demo = await isDemoProfessorUser(user.id);

  const uniId = demo ? DEMO_UNIVERSITY_ID : me.universityId ?? user.universityId ?? null;
  const terms = demo ? [] : await termsFor(uniId);
  const term = await currentTermFor(uniId);

  if (demo) {
    return (
      <ProfessorAvailabilityClient
        demo
        professor={{
          id: me.id,
          name: user.name,
          staffCode: me.staffCode,
          academicRank: DEMO_ACADEMIC_RANK,
          contractType: DEMO_CONTRACT_TYPE,
          departmentName: DEMO_DEPARTMENT_NAME,
          maxWeeklyUnits: 12,
        }}
        terms={
          term
            ? [{ id: term.id, code: term.termCode, title: DEMO_AVAILABILITY_TERM.title, isCurrent: true }]
            : [DEMO_AVAILABILITY_TERM]
        }
      />
    );
  }

  const [dep] = me.departmentId
    ? await db.select({ name: departments.name }).from(departments).where(eq(departments.id, me.departmentId)).limit(1)
    : [];
  const [termContract] = me && term
    ? await db.select({ baseDutyUnits: professor_term_contracts.baseDutyUnits })
        .from(professor_term_contracts)
        .where(and(eq(professor_term_contracts.staffId, me.id), eq(professor_term_contracts.termId, term.id)))
        .limit(1)
    : [];
  const maxWeeklyUnits = Number(termContract?.baseDutyUnits ?? 0);

  return (
    <ProfessorAvailabilityClient
      professor={{
        id: me.id,
        name: user.name,
        staffCode: me.staffCode,
        academicRank: me.academicRank ?? '',
        contractType: me.cooperationType ?? me.employmentType ?? '',
        departmentName: dep?.name ?? '',
        maxWeeklyUnits,
      }}
      terms={terms.map(t => ({
        id: t.id,
        code: t.termCode,
        title: t.title,
        isCurrent: Boolean(t.isCurrent),
      }))}
    />
  );
}
