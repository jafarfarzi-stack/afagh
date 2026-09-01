import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { students } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getStudentTracker } from '@/lib/graduation-engine';
import TrackerClient from './TrackerClient';

export const dynamic = 'force-dynamic';

export default async function StudentGraduationPage() {
  const user = await requireRole(['STUDENT']);
  const [me] = await db.select({ id: students.id }).from(students).where(eq(students.userId, user.id)).limit(1);

  if (!me) {
    return <div className="card p-6 text-center text-slate-600 font-bold">پروندهٔ دانشجویی یافت نشد.</div>;
  }

  const tracker = await getStudentTracker(me.id);
  return <TrackerClient initial={tracker} userId={user.id} />;
}
