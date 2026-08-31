import { and, desc, eq } from 'drizzle-orm';
import { academic_terms, course_offerings, courses, enrollments, majors } from '@/db/schema';
import { db, withUserRls } from '@/db';
import { getStudentByUser, requireRole } from '@/lib/auth';
import DropButton from './DropButton';

export const dynamic = 'force-dynamic';

const statusFa: Record<string, string> = {
  REGISTERED: 'ثبت قطعی',
  WAITLISTED: 'اتاق انتظار',
  PENDING_COUNCIL: 'در انتظار کمیسیون',
  DROPPED: 'حذف‌شده',
  EMERGENCY_DROPPED: 'حذف اضطراری',
  ABSENT: 'غایب',
  REJECTED: 'ردشده',
  ACTIVE: 'فعال / اشتغال به تحصیل',
  PROBATION: 'مشروط',
  GRADUATED: 'فارغ‌التحصیل',
};

export default async function StudentTranscriptPage() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) return <p className="card">پروندهٔ دانشجویی یافت نشد.</p>;

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  const [major] = me.majorId ? await db.select().from(majors).where(eq(majors.id, me.majorId)).limit(1) : [null];

  // خواندن کلیه سوابق دروس از مسیر امن RLS
  const allRows = await withUserRls(user.id, tx =>
    tx
      .select({
        id: enrollments.id,
        code: courses.code,
        title: courses.title,
        units: courses.units,
        status: enrollments.status,
        grade: enrollments.gradeValue,
        gradeStatus: enrollments.gradeStatus,
        ev: enrollments.hasEvaluated,
        termId: course_offerings.termId,
      })
      .from(enrollments)
      .innerJoin(course_offerings, eq(course_offerings.id, enrollments.offeringId))
      .innerJoin(courses, eq(courses.id, course_offerings.courseId))
      .where(eq(enrollments.studentId, me.id))
      .orderBy(desc(enrollments.id))
  );

  // تفکیک ترم جاری و کل واحدها
  const currentTermRows = term ? allRows.filter(r => r.termId === term.id) : allRows;
  const currentUnits = currentTermRows
    .filter(r => r.status === 'REGISTERED' || r.status === 'PENDING_COUNCIL')
    .reduce((sum, r) => sum + Number(r.units || 0), 0);

  // محاسبه دروس نمره‌دار
  const gradedRows = allRows.filter(r => r.grade != null && Number(r.grade) >= 0);
  const totalGradedUnits = gradedRows.reduce((sum, r) => sum + Number(r.units || 0), 0);
  const gpa = totalGradedUnits > 0
    ? (gradedRows.reduce((sum, r) => sum + Number(r.grade) * Number(r.units), 0) / totalGradedUnits).toFixed(2)
    : '—';

  return (
    <div className="space-y-4">
      {/* کارت مشخصات و وضعیت تحصیلی */}
      <div className="card !p-4 bg-gradient-to-br from-white to-slate-50 border-emerald-100">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-bold text-slate-800">{user.name}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{major?.name || 'مهندسی کامپیوتر'}</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">
            {statusFa[me.status] ?? me.status}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
          <div className="rounded-lg bg-slate-100/70 p-2">
            <p className="text-[10px] text-slate-500">شماره دانشجویی</p>
            <p className="font-mono text-xs font-bold text-slate-800 mt-0.5" dir="ltr">{me.studentCode}</p>
          </div>
          <div className="rounded-lg bg-slate-100/70 p-2">
            <p className="text-[10px] text-slate-500">واحدهای ترم جاری</p>
            <p className="text-xs font-bold text-indigo-700 mt-0.5">{currentUnits} واحد</p>
          </div>
          <div className="rounded-lg bg-slate-100/70 p-2">
            <p className="text-[10px] text-slate-500">معدل کل</p>
            <p className="text-xs font-bold text-emerald-700 mt-0.5">{gpa}</p>
          </div>
        </div>
      </div>

      {/* کارنامه دروس ترم جاری */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="font-bold text-slate-800 text-sm">
            📄 کارنامه و نمرات {term ? `(${term.title})` : ''}
          </h2>
          <span className="text-xs text-slate-500">{currentTermRows.length} درس</span>
        </div>

        {currentTermRows.length === 0 && (
          <div className="py-6 text-center text-slate-400 text-sm">
            هنوز درسی برای این ترم اخذ نشده است.
          </div>
        )}

        <div className="space-y-2">
          {currentTermRows.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm border border-slate-100">
              <div>
                <p className="font-medium text-slate-800">{r.title}</p>
                <p className="text-xs text-slate-500 mt-0.5" dir="ltr">{r.code} · {Number(r.units)} واحد</p>
              </div>
              <div className="text-left flex flex-col items-end gap-1">
                <span className={`text-[11px] px-2 py-0.5 rounded-md ${
                  r.status === 'REGISTERED' ? 'bg-emerald-100 text-emerald-800' :
                  r.status === 'PENDING_COUNCIL' ? 'bg-amber-100 text-amber-800' :
                  'bg-slate-200 text-slate-700'
                }`}>
                  {statusFa[r.status] ?? r.status}
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    {r.grade != null ? Number(r.grade).toFixed(2) : r.ev ? 'ارزشیابی شد' : '—'}
                  </span>
                  {r.status === 'REGISTERED' && <DropButton enrollmentId={r.id} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-slate-100 p-3 text-center text-[11px] text-slate-500">
        🔒 نمرات موقت پس از ثبت ارزشیابی اساتید نمایش داده می‌شوند و پس از پایان مهلت اعتراض، نهایی و قفل خواهند شد.
      </div>
    </div>
  );
}
