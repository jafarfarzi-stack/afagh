import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, payroll_statements, professor_term_contracts } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const payFa: Record<string, string> = { DRAFT: 'پیش‌نویس', MID_TERM_PAID: 'پرداخت میان‌ترم', FINAL_SETTLED: 'تسویه نهایی' };

export default async function ProfessorHome() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  if (!me) return <p className="card">پروندهٔ هیئت علمی یافت نشد.</p>;

  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.isCurrent, 1));
  const classes = term
    ? await db
        .select({ id: course_offerings.id, code: courses.code, title: courses.title, units: courses.units, enrolled: course_offerings.enrolledCount, capacity: course_offerings.capacity, group: course_offerings.groupNumber })
        .from(course_offerings).innerJoin(courses, eq(courses.id, course_offerings.courseId))
        .where(and(eq(course_offerings.professorId, me.id), eq(course_offerings.termId, term.id)))
    : [];

  const pays = await db
    .select({ id: payroll_statements.id, net: payroll_statements.netAmount, status: payroll_statements.status, midterm: payroll_statements.midtermPaidAmount })
    .from(payroll_statements)
    .innerJoin(professor_term_contracts, eq(professor_term_contracts.id, payroll_statements.contractId))
    .where(eq(professor_term_contracts.staffId, me.id));

  const totalNet = pays.reduce((s, p) => s + Number(p.net ?? 0), 0);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card md:col-span-2">
        <h2 className="mb-3 font-bold">کلاس‌های {term?.title ?? ''}</h2>
        {classes.length === 0 && <p className="text-sm text-slate-500">برای این ترم کلاسی ثبت نشده است.</p>}
        {classes.map(c => (
          <div key={c.id} className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
            <div>
              <p className="font-medium">{c.title}</p>
              <p className="text-xs text-slate-500" dir="ltr">{c.code} · گروه {c.group} · {Number(c.units)} واحد</p>
            </div>
            <span className="badge bg-sky-100 text-sky-800">{c.enrolled}/{c.capacity} نفر</span>
          </div>
        ))}
        <p className="mt-3 text-[11px] text-slate-400">ثبت نمرات، غیبت ۴۸ساعته و فرجام‌خواهی — ماژول‌های ۷ و ۸ در فاز سرور کامل‌اند.</p>
      </div>
      <div className="card">
        <h2 className="mb-3 font-bold">فیش حقوقی شفاف (§۲۲۴۳)</h2>
        {pays.length === 0 && <p className="text-sm text-slate-500">فیشی صادر نشده است.</p>}
        {pays.map(p => (
          <div key={p.id} className="mb-2 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex justify-between"><span>خالص پرداختی</span><b>{Number(p.net ?? 0).toLocaleString('fa-IR')} ري</b></div>
            <p className="mt-1 text-xs text-slate-500">{(payFa[p.status ?? ''] ?? p.status)} · میان‌ترم: {Number(p.midterm ?? 0).toLocaleString('fa-IR')} ري</p>
          </div>
        ))}
        {pays.length > 0 && <p className="mt-2 text-center text-sm font-bold">جمع خالص: {totalNet.toLocaleString('fa-IR')} ري</p>}
      </div>
    </div>
  );
}
