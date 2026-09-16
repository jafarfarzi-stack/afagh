import { requireRole } from '@/lib/auth';
import GradeCodesClient from './GradeCodesClient';

export const dynamic = 'force-dynamic';

export default async function GradeStatusCodesPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  return <GradeCodesClient />;
}
