import { requireRole } from '@/lib/auth';
import TeachingRolesClient from './TeachingRolesClient';

export const dynamic = 'force-dynamic';

export default async function TeachingRolesPage() {
  const denied = await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE']);
  if (denied) return denied;
  return <TeachingRolesClient />;
}
