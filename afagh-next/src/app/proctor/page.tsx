import { requireRole } from '@/lib/auth';
import ProctorExamAttendanceClient from './ProctorExamAttendanceClient';

export const dynamic = 'force-dynamic';

export default async function ProctorPage() {
  const user = await requireRole(['PROCTOR', 'ADMIN', 'EDU_EXPERT', 'PROFESSOR']);
  return <ProctorExamAttendanceClient user={user} />;
}
