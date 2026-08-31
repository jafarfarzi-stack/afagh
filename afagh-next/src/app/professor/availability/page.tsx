import { getStaffByUser, requireRole } from '@/lib/auth';
import { db } from '@/db';
import { academic_terms } from '@/db/schema';
import ProfessorAvailabilityClient from './ProfessorAvailabilityClient';

export const dynamic = 'force-dynamic';

export default async function ProfessorAvailabilityPage() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  const terms = await db.select().from(academic_terms);

  return (
    <ProfessorAvailabilityClient
      professor={{
        id: me?.id || 1,
        name: user.name,
        staffCode: me?.staffCode || user.nationalId,
        academicRank: 'استادیار',
        contractType: 'تمام‌وقت',
        departmentName: 'گروه مهندسی کامپیوتر',
        maxWeeklyUnits: 16,
      }}
      terms={terms.map(t => ({
        id: t.id,
        code: t.code,
        title: t.title,
        isCurrent: Boolean(t.isCurrent),
      }))}
    />
  );
}
