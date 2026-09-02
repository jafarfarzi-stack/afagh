import { requireRole } from '@/lib/auth';
import ExamPlanningClient from './ExamPlanningClient';

export const dynamic = 'force-dynamic';

export default async function AdminExamsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VAULT_MANAGER']);
  return <ExamPlanningClient />;
}
