import { getStaffByUser, requireRole } from '@/lib/auth';
import { currentTermFor } from '@/lib/terms';
import {
  professorDepartmentName,
  professorScheduleRows,
  universityTitle,
} from '@/lib/professor-data';
import { isDemoProfessorUser } from '@/lib/demo-accounts';
import {
  DEMO_ACADEMIC_RANK,
  DEMO_CONTRACT_TYPE,
  DEMO_DEPARTMENT_NAME,
  DEMO_SCHEDULE_OFFERINGS,
  DEMO_TERM_TITLE,
  DEMO_UNIVERSITY_TITLE,
} from '@/lib/demo-professor-data';
import ProfessorScheduleClient, { type ProfessorScheduleOffering } from './ProfessorScheduleClient';

export const dynamic = 'force-dynamic';

export default async function ProfessorSchedulePage() {
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

  if (demo) {
    return (
      <ProfessorScheduleClient
        professor={{
          id: me.id,
          name: user.name,
          staffCode: me.staffCode,
          academicRank: DEMO_ACADEMIC_RANK,
          contractType: DEMO_CONTRACT_TYPE,
          departmentName: DEMO_DEPARTMENT_NAME,
          universityTitle: DEMO_UNIVERSITY_TITLE,
        }}
        termTitle={DEMO_TERM_TITLE}
        initialOfferings={DEMO_SCHEDULE_OFFERINGS}
      />
    );
  }

  const universityId = me.universityId ?? user.universityId ?? null;
  const term = await currentTermFor(universityId);
  const [departmentName, uniTitle] = await Promise.all([
    professorDepartmentName(me.departmentId),
    universityTitle(universityId),
  ]);

  const offerings: ProfessorScheduleOffering[] = term
    ? (await professorScheduleRows(me.id, term.id, universityId))
    : [];

  const professorData = {
    id: me.id,
    name: user.name,
    staffCode: me.staffCode,
    academicRank: me.academicRank ?? '',
    contractType: me.cooperationType ?? me.employmentType ?? me.staffType ?? '',
    departmentName: departmentName ?? '',
    universityTitle: uniTitle ?? '',
  };

  return (
    <ProfessorScheduleClient
      professor={professorData}
      termTitle={term?.title ?? ''}
      initialOfferings={offerings}
    />
  );
}