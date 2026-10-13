import { requireRole } from '@/lib/auth';
import DormClient from './DormClient';

export const dynamic = 'force-dynamic';

export default async function DormPage() {
  const denied = await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  if (denied) return denied;
  return <DormClient />;
}
