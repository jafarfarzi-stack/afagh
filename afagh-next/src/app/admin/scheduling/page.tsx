import { requireRole } from '@/lib/auth';
import DepartmentPlanningClient from './DepartmentPlanningClient';

export const dynamic = 'force-dynamic';

export default async function DepartmentPlanningPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  return <DepartmentPlanningClient />;
}
