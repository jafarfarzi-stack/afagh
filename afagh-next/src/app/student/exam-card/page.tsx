import { requireRole } from '@/lib/auth';
import { getPublicBaseUrl } from '@/lib/settings';
import ExamCardClient from './ExamCardClient';

export const dynamic = 'force-dynamic';

export default async function StudentExamCardPage() {
  const user = await requireRole(['STUDENT']);
  return <ExamCardClient user={user} publicBaseUrl={await getPublicBaseUrl()} />;
}
