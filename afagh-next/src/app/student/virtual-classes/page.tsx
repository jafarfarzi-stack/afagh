import { getStudentByUser, requireRole } from '@/lib/auth';
import { getBbbConfig } from '@/lib/settings';
import { getTermScope } from '@/lib/term-scope';
import { isDemoStudentUser } from '@/lib/demo-accounts';
import { DEMO_LIVE_SESSIONS, DEMO_RECORDINGS, demoTermFilterNotice } from '@/lib/demo-student-data';
import VirtualClassroomWidget from '@/components/VirtualClassroomWidget';
import { listTermVirtualClasses } from './live-classes-data';
import TermFilterChip from '../term-filter-chip';

export const dynamic = 'force-dynamic';

export default async function StudentVirtualClassesPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  const scope = await getTermScope(me?.universityId ?? user.universityId);
  const selectedTerm = scope.selectedId
    ? scope.terms.find(t => t.id === scope.selectedId) ?? null
    : null;

  const demo = await isDemoStudentUser(user.id);
  const demoTermBlocked = demo && !!selectedTerm;

  const [liveSessions, bbb] = await Promise.all([
    demo
      ? Promise.resolve(DEMO_LIVE_SESSIONS)
      : me
        ? listTermVirtualClasses(me.id, selectedTerm?.id ?? null)
        : Promise.resolve([]),
    getBbbConfig(),
  ]);

  const shownSessions = demoTermBlocked ? [] : liveSessions;

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
            دانشجو: {user.name}
            {me ? <> · شماره دانشجویی: <span dir="ltr">{me.studentCode || '—'}</span></> : ' · پروندهٔ دانشجویی یافت نشد'}
          </p>
        </div>
        <div className="text-left bg-emerald-950/60 p-3 rounded-2xl border border-emerald-500/20 text-xs">
          <p className="text-emerald-300 font-bold">⏱️ وضعیت اتصال LMS:</p>
          <p className="text-emerald-100 font-mono text-[11px] mt-0.5">
            BigBlueButton: {bbb.configured ? 'پیکربندی شده' : 'پیکربندی نشده است'}
          </p>
          <p className="text-emerald-100 font-mono text-[11px]">
            اتاق‌های ثبت‌شده: {shownSessions.length.toLocaleString('fa-IR')}
          </p>
        </div>
      </div>

      {selectedTerm && (
        <div className="print:hidden flex justify-start">
          <TermFilterChip title={selectedTerm.title} universityId={me?.universityId ?? user.universityId} />
        </div>
      )}

      {!me && (
        <div className="card p-6 text-center text-sm text-slate-600">پروندهٔ دانشجویی شما یافت نشد؛ کلاس مجازی قابل نمایش نیست.</div>
      )}

      {demoTermBlocked && (
        <p className="print:hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          {demoTermFilterNotice(selectedTerm!.title)}
        </p>
      )}

      <VirtualClassroomWidget
        user={{ id: user.id, name: user.name || 'دانشجو', role: 'STUDENT' }}
        initialSessions={shownSessions}
        recordings={demo ? DEMO_RECORDINGS : undefined}
      />
    </div>
  );
}