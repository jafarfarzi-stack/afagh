import { requireRole } from '@/lib/auth';
import CoverageClient from './CoverageClient';

export const dynamic = 'force-dynamic';

export default async function CoveragePage() {
  // requireRole در موفقیت SessionUser برمی‌گرداند و در شکست redirect می‌کند —
  // مقدار برگشتی را نباید به‌عنوان کامپوننت برگرداند (باعث crash می‌شد).
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE']);
  return <CoverageClient />;
}
