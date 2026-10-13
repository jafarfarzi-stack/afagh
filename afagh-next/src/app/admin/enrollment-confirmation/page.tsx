import { requireRole } from '@/lib/auth';
import EnrollConfirmAdminClient from './EnrollConfirmAdminClient';

export const dynamic = 'force-dynamic';

export default async function EnrollConfirmAdminPage() {
  const denied = await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  if (denied) return denied;
  return <EnrollConfirmAdminClient />;
}
