import { requireRole } from '@/lib/auth';
import PayrollEngineClient from './PayrollEngineClient';

export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  return <PayrollEngineClient />;
}
