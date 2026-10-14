import { requireRole } from '@/lib/auth';
import EnrollmentApprovalsClient from './EnrollmentApprovalsClient';

export const dynamic = 'force-dynamic';

export default async function EnrollmentApprovalsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  return <EnrollmentApprovalsClient />;
}
