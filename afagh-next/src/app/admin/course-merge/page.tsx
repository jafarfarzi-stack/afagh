import { requireRole } from '@/lib/auth';
import CourseMergeClient from './CourseMergeClient';

export const dynamic = 'force-dynamic';

export default async function CourseMergePage() {
  const denied = await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU']);
  if (denied) return denied;
  return <CourseMergeClient />;
}
