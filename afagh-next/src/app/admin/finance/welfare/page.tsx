import { requireRole } from '@/lib/auth';
import WelfareClient from './WelfareClient';

export const dynamic = 'force-dynamic';

export default async function WelfarePage() {
  await requireRole(['ADMIN', 'FINANCE_EXPERT', 'FINANCE']);
  return <WelfareClient />;
}
