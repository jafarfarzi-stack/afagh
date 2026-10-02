import { requireRole } from '@/lib/auth';
import { getStudentFinance, listFinanceStudents } from '@/lib/finance-engine';
import { getCurrentUniversity } from '@/lib/university-scope';
import StudentStatementClient from '../StudentStatementClient';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'] as never[];

export default async function StudentStatementPage(props: { searchParams: Promise<{ studentId?: string }> }) {
  await requireRole(FINANCE);
  const currentUniversity = await getCurrentUniversity();
  if (!currentUniversity) return <div className="card p-6 text-center text-slate-500">دانشگاه فعال یافت نشد</div>;

  const sp = await props.searchParams;
  const studentId = Number(sp.studentId ?? 0);

  if (!studentId) {
    // Show student selector
    const students = await listFinanceStudents({ universityId: currentUniversity.id, limit: 500 });
    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div>
            <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">📄 صورت حساب مالی دانشجویان</h1>
            <p className="text-xs text-slate-500 mt-1">انتخاب دانشجو برای مشاهده صورت حساب کامل (۹ مشخصه سما)</p>
          </div>
        </div>
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-600">
                  <th className="p-2">شماره دانشجویی</th>
                  <th className="p-2">نام</th>
                  <th className="p-2">رشته</th>
                  <th className="p-2">مقطع</th>
                  <th className="p-2">ورودی</th>
                  <th className="p-2">مانده کل</th>
                  <th className="p-2">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.studentId} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-2 font-mono text-slate-700">{s.studentCode}</td>
                    <td className="p-2 text-slate-800">{s.firstName} {s.lastName}</td>
                    <td className="p-2 text-slate-600">{s.majorTitle}</td>
                    <td className="p-2 text-slate-600">{s.degreeTitle}</td>
                    <td className="p-2 text-slate-600">{s.entryYear}</td>
                    <td className={`p-2 font-bold ${s.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{s.balance.toLocaleString('fa-IR')} ریال</td>
                    <td className="p-2">
                      <a href={`/admin/finance/reports/student-statement?studentId=${s.studentId}`} className="rounded bg-emerald-700 hover:bg-emerald-800 px-2 py-1 text-[11px] font-medium text-white">مشاهده صورت حساب</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Show statement for specific student
  const fin = await getStudentFinance(studentId);
  if (!fin) return <div className="card p-6 text-center text-slate-500">اطلاعات مالی یافت نشد</div>;

  return <StudentStatementClient studentId={studentId} studentName={fin.student.fullName} studentCode={fin.student.studentCode ?? ''} />;
}