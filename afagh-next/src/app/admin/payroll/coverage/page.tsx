import { requireRole } from '@/lib/auth';
import CoverageClient from './CoverageClient';

export const dynamic = 'force-dynamic';

export default async function CoveragePage() {
  const denied = await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE']);
  if (denied) return denied;
  return <CoverageClient />;
}
