import { requireRole } from '@/lib/auth';
import CouncilClient from './CouncilClient';

export const dynamic = 'force-dynamic';

export default async function CouncilPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  return <CouncilClient />;
}
