import { getStaffByUser, requireRole } from '@/lib/auth';
import {
  professorDepartmentName,
  professorScheduleRows,
  universityTitle,
} from '@/lib/professor-data';
import { professorTermFilter } from '@/lib/professor-term-filter';
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
import ProfessorTermFilterBanner from '../term-filter-banner';

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
  const universityId = me.universityId ?? user.universityId ?? null;
  const { term, selectedTerm } = await professorTermFilter(universityId);

  if (demo) {
    return (
      <div className="space-y-3">
        <ProfessorTermFilterBanner selectedTerm={selectedTerm} universityId={universityId} demo />
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
      </div>
    );
  }

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
    <div className="space-y-3">
      <ProfessorTermFilterBanner selectedTerm={selectedTerm} universityId={universityId} />
      <ProfessorScheduleClient
        professor={professorData}
        termTitle={term?.title ?? ''}
        initialOfferings={offerings}
      />
    </div>
  );
}