import { and, desc, eq } from 'drizzle-orm';
import { academic_terms, course_offerings, courses, enrollments, student_requests, process_definitions } from '@/db/schema';
import { db, withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import DropButton from './DropButton';

export const dynamic = 'force-dynamic';

const statusFa: Record<string, string> = {
  REGISTERED: 'ثبت‌شده', WAITLISTED: 'اتاق انتظار', PENDING_COUNCIL: 'در انتظار کمیسیون',
  DROPPED: 'حذف‌شده', EMERGENCY_DROPPED: 'حذف اضطراری', ABSENT: 'غایب', REJECTED: 'ردشده',
  SUBMITTED: 'ارسال‌شده به شورا', IN_REVIEW: 'در دست بررسی', APPROVED: 'تأییدشده', RETURNED: 'بازگشتی'
};

const reqBadge: Record<string, string> = {
  SUBMITTED: 'bg-amber-100 text-amber-800 border-amber-300',
  IN_REVIEW: 'bg-sky-100 text-sky-800 border-sky-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  REJECTED: 'bg-red-100 text-red-800 border-red-300',
};

export default async function StudentHome() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card">پروندهٔ دانشجویی یافت نشد.</p>;

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  
  // خواندن دروس از مسیر RLS
  const rows = await withUserRls(user.id, tx =>
    tx
      .select({ id: enrollments.id, code: courses.code, title: courses.title, units: courses.units, status: enrollments.status, grade: enrollments.gradeValue, ev: enrollments.hasEvaluated })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(term ? and(eq(enrollments.studentId, me.id), eq(course_offerings.termId, term.id)) : eq(enrollments.studentId, me.id))
      .orderBy(desc(enrollments.id)));

  // خواندن درخواست‌های گردش کار دانشجو
  const myRequests = await withUserRls(user.id, tx =>
    tx
      .select({
        id: student_requests.id,
        track: student_requests.trackingCode,
        status: student_requests.status,
        created: student_requests.createdAt,
        formData: student_requests.formData,
        processTitle: process_definitions.title
      })
      .from(student_requests)
      .leftJoin(process_definitions, eq(process_definitions.id, student_requests.processId))
      .where(eq(student_requests.studentId, me.id))
      .orderBy(desc(student_requests.id))
      .limit(10)
  );

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-xs text-slate-500">شماره دانشجویی</p>
        <p className="font-mono text-lg font-bold" dir="ltr">{me.studentCode}</p>
        <p className="mt-1 text-xs">وضعیت پرونده: <span className="font-semibold text-emerald-700">{statusFa[me.status] ?? me.status}</span> — {term ? term.title : 'بدون ترم جاری'}</p>
      </div>

      {/* بخش پیگیری درخواست‌ها و کمیسیون */}
      <div className="card space-y-2">
        <h2 className="font-bold flex items-center justify-between">
          <span>📋 پیگیری درخواست‌ها و کمیسیون</span>
          <span className="text-xs font-normal text-slate-500">{myRequests.length} مورد</span>
        </h2>
        {myRequests.length === 0 && <p className="text-sm text-slate-400">درخواست یا ارجاع فعالی ندارید.</p>}
        {myRequests.map(req => {
          let extra: any = {};
          try { if (req.formData) extra = JSON.parse(req.formData); } catch (_) {}
          return (
            <div key={req.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">{req.processTitle || 'درخواست کمیسیون'}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${reqBadge[req.status] || 'bg-slate-100 text-slate-700'}`}>
                  {statusFa[req.status] ?? req.status}
                </span>
              </div>
              {extra?.offeringTitle && (
                <p className="text-xs text-indigo-700">موضوع: اخذ درس {extra.offeringTitle}</p>
              )}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>کد رهگیری: <b className="font-mono text-slate-700" dir="ltr">{req.track}</b></span>
                <span>{req.created ? new Date(req.created).toLocaleDateString('fa-IR') : '—'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* دروس ترم جاری */}
      <div className="card space-y-2">
        <h2 className="font-bold">دروس {term ? 'ترم جاری' : ''}</h2>
        {rows.length === 0 && <p className="text-sm text-slate-500">هنوز واحدی ثبت نشده است.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
            <div>
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-slate-500" dir="ltr">{r.code} · {Number(r.units)} واحد</p>
            </div>
            <div className="text-left">
              <span className={`text-xs px-2 py-0.5 rounded-md ${r.status === 'PENDING_COUNCIL' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>
                {statusFa[r.status] ?? r.status}
              </span>
              <p className="text-sm font-bold mt-1">{r.grade != null ? Number(r.grade).toFixed(2) : r.ev ? 'ارزشیابی شد' : '—'}</p>
              {r.status === 'REGISTERED' && <DropButton enrollmentId={r.id} />}
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-[11px] text-slate-400">گیت ارزشیابی معلم (hasEvaluated) پیش از ثبت نمره نهایی الزامی است — ماژول ۷</p>
    </div>
  );
}
