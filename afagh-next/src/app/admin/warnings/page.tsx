import { requireRole } from '@/lib/auth';
import WarningsClient from './WarningsClient';

export const dynamic = 'force-dynamic';

export default async function WarningsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  return <WarningsClient />;
}
