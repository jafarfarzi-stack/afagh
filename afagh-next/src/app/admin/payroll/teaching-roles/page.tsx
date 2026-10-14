import { requireRole } from '@/lib/auth';
import TeachingRolesClient from './TeachingRolesClient';

export const dynamic = 'force-dynamic';

export default async function TeachingRolesPage() {
  // requireRole در موفقیت SessionUser برمی‌گرداند و در شکست redirect می‌کند —
  // مقدار برگشتی را نباید به‌عنوان کامپوننت برگرداند (باعث crash می‌شد).
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE']);
  return <TeachingRolesClient />;
}
