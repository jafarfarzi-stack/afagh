import { getStudentByUser, requireRole } from '@/lib/auth';
import { getStudentTracker } from '@/lib/graduation-engine';
import TrackerClient from './TrackerClient';

export const dynamic = 'force-dynamic';

export default async function StudentGraduationPage() {
  const user = await requireRole(['STUDENT']);
  // getStudentByUser خودترمیم هم دارد: برای حساب دمو بدون رکورد، پرونده همان‌جا ساخته می‌شود
  const me = await getStudentByUser(user.id);

  if (!me) {
    return <div className="card p-6 text-center text-slate-600 font-bold">پروندهٔ دانشجویی یافت نشد.</div>;
  }

  const tracker = await getStudentTracker(me.id);
  return <TrackerClient initial={tracker} userId={user.id} />;
}
