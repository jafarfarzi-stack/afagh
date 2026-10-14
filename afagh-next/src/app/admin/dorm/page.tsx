import { requireRole } from '@/lib/auth';
import DormClient from './DormClient';

export const dynamic = 'force-dynamic';

export default async function DormPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  return <DormClient />;
}
