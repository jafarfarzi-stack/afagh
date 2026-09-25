import { db } from '@/db';
import { clearance_departments } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { listDossiers, pipelineStats, ensureClearanceDepartments, WORKFLOW_STEPS } from '@/lib/graduation-engine';
import { allRequests, serviceCatalog } from '@/lib/alumni';
import { getCurrentUniversity } from '@/lib/university-scope';
import GraduationClient from './GraduationClient';

export const dynamic = 'force-dynamic';

export default async function AdminGraduationPage() {
  await requireRole(['ADMIN', 'GRADUATEAFFAIRS']);
  await ensureClearanceDepartments();

  const currentUniversity = await getCurrentUniversity();
  const currentUniversityId = currentUniversity?.id ?? null;

  const [rows, stats, departments, alumni, services] = await Promise.all([
    listDossiers({ universityId: currentUniversityId }),
    pipelineStats({ universityId: currentUniversityId }),
    db.select().from(clearance_departments),
    allRequests(),
    serviceCatalog(),
  ]);

  return (
    <GraduationClient
      initialRows={rows}
      initialStats={stats}
      initialDepartments={departments.map(d => ({
        id: d.id, code: d.code, title: d.title, autoCheck: d.autoCheck ?? 'NONE',
        apiUrl: d.apiUrl, responsibleRoleCode: d.responsibleRoleCode,
        sortOrder: d.sortOrder ?? 100, isActive: d.isActive === 1, hint: d.hint,
      }))}
      initialAlumniRequests={alumni}
      services={services}
      steps={WORKFLOW_STEPS.map(s => ({ code: s.code, title: s.title, actor: s.actor }))}
    />
  );
}
