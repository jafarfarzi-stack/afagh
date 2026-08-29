import { and, desc, eq } from 'drizzle-orm';
import { academic_terms, course_offerings, courses, enrollments } from '@/db/schema';
import { db, withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import DropButton from './DropButton';

export const dynamic = 'force-dynamic';

const statusFa: Record<string, string> = {
  REGISTERED: 'ثبت‌شده', WAITLISTED: 'اتاق انتظار', PENDING_COUNCIL: 'در انتظار کمیسیون',
  DROPPED: 'حذف‌شده', EMERGENCY_DROPPED: 'حذف اضطراری', ABSENT: 'غایب', REJECTED: 'ردشده',
};

export default async function StudentHome() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card">پروندهٔ دانشجویی یافت نشد.</p>;

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  // خواندن از مسیر RLS (§۲۱۷۰): نقش afagh_app + set_config محلی — ردیف دیگران در سطح DB ناموجود است
  const rows = await withUserRls(user.id, tx =>
    tx
      .select({ id: enrollments.id, code: courses.code, title: courses.title, units: courses.units, status: enrollments.status, grade: enrollments.gradeValue, ev: enrollments.hasEvaluated })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(term ? and(eq(enrollments.studentId, me.id), eq(course_offerings.termId, term.id)) : eq(enrollments.studentId, me.id))
      .orderBy(desc(enrollments.id)));

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-xs text-slate-500">شماره دانشجویی</p>
        <p className="font-mono text-lg font-bold" dir="ltr">{me.studentCode}</p>
        <p className="mt-1 text-xs">وضعیت: {statusFa[me.status] ?? me.status} — {term ? term.title : 'بدون ترم جاری'}</p>
      </div>
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
              <p className="text-xs">{statusFa[r.status] ?? r.status}</p>
              <p className="text-sm font-bold">{r.grade != null ? Number(r.grade).toFixed(2) : r.ev ? 'ارزشیابی شد' : '—'}</p>
              {r.status === 'REGISTERED' && <DropButton enrollmentId={r.id} />}
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-[11px] text-slate-400">گیت ارزشیابی معلم (hasEvaluated) پیش از ثبت نمره نهایی الزامی است — ماژول ۷</p>
    </div>
  );
}
