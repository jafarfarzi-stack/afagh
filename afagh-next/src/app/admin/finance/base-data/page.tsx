import { requireRole } from '@/lib/auth';
import BaseDataClient from './BaseDataClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'دادهٔ پایهٔ مالی' };

export default async function BaseDataPage() {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE']);
  return <BaseDataClient />;
}
