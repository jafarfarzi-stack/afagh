import { requireRole } from '@/lib/auth';
import RegulationCheckClient from './RegulationCheckClient';

export const dynamic = 'force-dynamic';

export default async function AdminRegulationCheckPage() {
  await requireRole(['ADMIN']);

  return <RegulationCheckClient />;
}