import { requireRole } from '@/lib/auth';
import AdminPermissionsClient from './AdminPermissionsClient';

export const dynamic = 'force-dynamic';

export default async function AdminPermissionsPage() {
  await requireRole(['ADMIN']);

  return <AdminPermissionsClient />;
}
