import { requireRole } from '@/lib/auth';
import DisciplineClient from './DisciplineClient';

export const dynamic = 'force-dynamic';

export default async function DisciplinePage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  return <DisciplineClient />;
}
