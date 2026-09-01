import { getStudentByUser, requireRole } from '@/lib/auth';
import VirtualClassroomWidget from '@/components/VirtualClassroomWidget';
import { getTodayLiveClasses } from '@/lib/moodle-bbb';

export const dynamic = 'force-dynamic';

export default async function StudentVirtualClassesPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  const liveSessions = await getTodayLiveClasses();

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-emerald-900 text-white rounded-3xl p-6 shadow-xl border border-emerald-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-400 text-slate-950">
            سامانه آموزش مجازی (LMS)
          </span>
          <h1 className="text-xl sm:text-2xl font-black mt-2">
            کلاس‌های آنلاین و وبینار (BigBlueButton & Moodle)
          </h1>
          <p className="text-xs text-emerald-200 mt-1">
            دانشجو: {user.name} · شماره دانشجویی: {me?.studentCode || '۳۱۴۱۲۰۰۱'}
          </p>
        </div>
        <div className="text-left bg-emerald-950/60 p-3 rounded-2xl border border-emerald-500/20 text-xs">
          <p className="text-emerald-300 font-bold">⏱️ وضعیت اتصال LMS:</p>
          <p className="text-emerald-100 font-mono text-[11px] mt-0.5">Moodle SSO: فعال (یکپارچه)</p>
          <p className="text-emerald-100 font-mono text-[11px]">BigBlueButton: آماده ورود بدون نیاز به لاگین مجدد</p>
        </div>
      </div>

      <VirtualClassroomWidget
        user={{ id: user.id, name: user.name || 'دانشجو', role: 'STUDENT' }}
        initialSessions={liveSessions}
      />
    </div>
  );
}
