import { getStudentByUser, requireRole } from '@/lib/auth';
import { getBbbConfig } from '@/lib/settings';
import { getTermScope } from '@/lib/term-scope';
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

  const [liveSessions, bbb] = await Promise.all([
    me ? listTermVirtualClasses(me.id, selectedTerm?.id ?? null) : Promise.resolve([]),
    getBbbConfig(),
  ]);

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
            اتاق‌های ثبت‌شده: {liveSessions.length.toLocaleString('fa-IR')}
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

      <VirtualClassroomWidget
        user={{ id: user.id, name: user.name || 'دانشجو', role: 'STUDENT' }}
        initialSessions={liveSessions}
      />
    </div>
  );
}