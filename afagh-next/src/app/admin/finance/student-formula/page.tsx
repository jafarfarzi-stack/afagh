import { requireRole } from '@/lib/auth';
import StudentFormulaClient from './StudentFormulaClient';

export const dynamic = 'force-dynamic';

export default async function StudentFormulaPage() {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE']);
  return <StudentFormulaClient />;
}
