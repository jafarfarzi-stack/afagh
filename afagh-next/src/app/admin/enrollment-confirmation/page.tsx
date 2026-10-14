import { requireRole } from '@/lib/auth';
import EnrollConfirmAdminClient from './EnrollConfirmAdminClient';

export const dynamic = 'force-dynamic';

export default async function EnrollConfirmAdminPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  return <EnrollConfirmAdminClient />;
}
