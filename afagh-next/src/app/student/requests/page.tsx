import { desc, eq } from 'drizzle-orm';
import { process_definitions, student_requests } from '@/db/schema';
import { withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const statusFa: Record<string, string> = {
  SUBMITTED: 'ارسال‌شده به شورا',
  IN_REVIEW: 'در دست بررسی',
  APPROVED: 'تأییدشده ✓',
  REJECTED: 'ردشده ✗',
  RETURNED: 'نیازمند بازبینی',
};

const reqBadge: Record<string, string> = {
  SUBMITTED: 'bg-amber-50 text-amber-800 border-amber-300',
  IN_REVIEW: 'bg-sky-50 text-sky-800 border-sky-300',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold',
  REJECTED: 'bg-red-50 text-red-800 border-red-300',
  RETURNED: 'bg-purple-50 text-purple-800 border-purple-300',
};

export default async function StudentRequestsPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card">پروندهٔ دانشجویی یافت نشد.</p>;

  // خواندن درخواست‌های گردش کار دانشجو تحت RLS
  const myRequests = await withUserRls(user.id, tx =>
    tx
      .select({
        id: student_requests.id,
        track: student_requests.trackingCode,
        status: student_requests.status,
        created: student_requests.createdAt,
        updated: student_requests.updatedAt,
        formData: student_requests.formData,
        processTitle: process_definitions.title,
      })
      .from(student_requests)
      .leftJoin(process_definitions, eq(process_definitions.id, student_requests.processId))
      .where(eq(student_requests.studentId, me.id))
      .orderBy(desc(student_requests.id))
  );

  const pendingCount = myRequests.filter(r => r.status === 'SUBMITTED' || r.status === 'IN_REVIEW').length;
  const approvedCount = myRequests.filter(r => r.status === 'APPROVED').length;

  return (
    <div className="space-y-4">
      {/* هدر خلاصه وضعیت کارتابل */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center !p-3">
          <p className="text-xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-xs text-slate-500">در دست بررسی شورا</p>
        </div>
        <div className="card text-center !p-3">
          <p className="text-xl font-bold text-emerald-600">{approvedCount}</p>
          <p className="text-xs text-slate-500">تأیید و ثبت نهایی</p>
        </div>
      </div>

      {/* فهرست درخواست‌های گردش کار */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h1 className="font-bold text-slate-800 text-sm">📋 کارتابل درخواست‌های دانشجو</h1>
          <span className="text-xs text-slate-400">{myRequests.length} پرونده</span>
        </div>

        {myRequests.length === 0 && (
          <div className="py-8 text-center text-slate-400">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm">در حال حاضر هیچ درخواست یا ارجاعی به کمیسیون ندارید.</p>
            <p className="text-xs text-slate-400 mt-1">در صورت وجود تداخل یا عدم پیش‌نیاز در انتخاب واحد، می‌توانید درس را به شورا ارجاع دهید.</p>
          </div>
        )}

        {myRequests.map(req => {
          let extra: any = {};
          try {
            if (req.formData) extra = JSON.parse(req.formData);
          } catch (_) {}

          return (
            <div key={req.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-sm">{req.processTitle || 'درخواست کمیسیون موارد خاص'}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border ${reqBadge[req.status] || 'bg-slate-100 text-slate-700'}`}>
                  {statusFa[req.status] ?? req.status}
                </span>
              </div>

              {extra?.offeringTitle && (
                <div className="rounded-lg bg-indigo-50/70 p-2 text-xs text-indigo-900">
                  <p className="font-semibold">موضوع: درخواست اخذ درس {extra.offeringTitle}</p>
                  {extra.reasons && Array.isArray(extra.reasons) && (
                    <p className="text-[11px] text-indigo-700 mt-0.5 opacity-90">{extra.reasons.join(' · ')}</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-50">
                <span>کد رهگیری: <b className="font-mono text-slate-800" dir="ltr">{req.track}</b></span>
                <span>{req.created ? new Date(req.created).toLocaleDateString('fa-IR') : '—'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-amber-50/80 p-3 text-xs text-amber-900 border border-amber-200">
        💡 <b>راهنما:</b> نتیجهٔ بررسی شورا و مدیر گروه به صورت خودکار در همین کارتابل به‌روزرسانی شده و در صورت تأیید، درس مربوطه به صورت قطعی در کارنامه شما ثبت می‌شود.
      </div>
    </div>
  );
}
