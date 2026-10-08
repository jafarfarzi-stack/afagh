import { getStaffByUser, requireRole } from '@/lib/auth';
import {
  groupIntoMerged,
  mergedDisplayTitle,
  mergedGroupKey,
  offeringSharedKeys,
  professorDepartmentName,
  professorScheduleRows,
  professorUniqueOfferings,
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

  const scheduleRowsAll = term
    ? (await professorScheduleRows(me.id, term.id, universityId))
    : [];

  const mergeSlotsById = new Map<number, { dayOfWeek: number | null; startTime: string; endTime: string; roomKey: string }[]>();
  for (const r of scheduleRowsAll) {
    const list = mergeSlotsById.get(r.id) ?? [];
    list.push({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, roomKey: r.roomName });
    mergeSlotsById.set(r.id, list);
  }
  const mergeSharedKeys = await offeringSharedKeys([...new Set(scheduleRowsAll.map(r => r.id))]);
  const mergeKeyOf = (id: number, slot: { dayOfWeek: number | null; startTime: string; endTime: string; roomKey: string }) =>
    mergedGroupKey(mergeSharedKeys.get(id) ?? null, slot);
  const fullGroups = groupIntoMerged(
    professorUniqueOfferings(scheduleRowsAll),
    r => r.id,
    r => mergedGroupKey(mergeSharedKeys.get(r.id) ?? null, mergeSlotsById.get(r.id) ?? []),
  );
  const fullInfoById = new Map<number, { code: string; title: string; units: number; enrolled: number; capacity: number; primaryId: number }>();
  for (const g of fullGroups) {
    const primary = g.members.find(m => m.id === g.primaryId) ?? g.members[0];
    const codes = [...new Set(g.members.map(m => m.code))];
    const info = {
      code: codes.join(' / '),
      title: g.merged ? mergedDisplayTitle(primary.title, codes) : primary.title,
      units: Math.max(...g.members.map(m => m.units)),
      enrolled: g.members.reduce((s, m) => s + m.enrolledCount, 0),
      capacity: Math.max(...g.members.map(m => m.capacity)),
      primaryId: g.primaryId,
    };
    for (const m of g.members) fullInfoById.set(m.id, info);
  }
  const rowGroups = groupIntoMerged(
    scheduleRowsAll,
    r => r.id,
    r => mergeKeyOf(r.id, { dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, roomKey: r.roomName }),
  );
  const offerings: ProfessorScheduleOffering[] = rowGroups.map(g => {
    const rep = g.members.find(m => m.id === g.primaryId) ?? g.members[0];
    const info = fullInfoById.get(rep.id);
    return {
      ...rep,
      id: info?.primaryId ?? rep.id,
      code: info?.code ?? rep.code,
      title: info?.title ?? rep.title,
      units: info?.units ?? rep.units,
      enrolledCount: info?.enrolled ?? rep.enrolledCount,
      capacity: info?.capacity ?? rep.capacity,
    };
  });

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