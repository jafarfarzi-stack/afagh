import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, departments, professor_term_contracts } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';
import ProfessorAvailabilityClient from './ProfessorAvailabilityClient';
import { currentTermFor, termsFor } from '@/lib/terms';

export const dynamic = 'force-dynamic';

export default async function ProfessorAvailabilityPage() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  const uniId = me.universityId ?? user.universityId ?? null;
  const terms = await termsFor(uniId);
  const term = await currentTermFor(uniId);

  // اطلاعات واقعی از پروندهٔ استاف + گروه آموزشی
  const [dep] = me?.departmentId
    ? await db.select({ name: departments.name }).from(departments).where(eq(departments.id, me.departmentId)).limit(1)
    : [];
  const [termContract] = term
    ? await db.select({ baseDutyUnits: professor_term_contracts.baseDutyUnits })
        .from(professor_term_contracts)
        .where(and(eq(professor_term_contracts.staffId, me?.id ?? -1), eq(professor_term_contracts.termId, term.id)))
        .limit(1)
    : [];
  const maxWeeklyUnits = Number(termContract?.baseDutyUnits ?? 0);

  return (
    <ProfessorAvailabilityClient
      professor={{
        id: me?.id ?? 0,
        name: user.name,
        staffCode: me?.staffCode ?? '',
        academicRank: me?.academicRank ?? '',
        contractType: me?.cooperationType ?? (me?.employmentType ?? ''),
        departmentName: dep?.name ?? '—',
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
