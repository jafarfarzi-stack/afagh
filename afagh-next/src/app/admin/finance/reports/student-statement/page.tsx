import { requireRole } from '@/lib/auth';
import { getStudentFinance, listFinanceStudents } from '@/lib/finance-engine';
import { getCurrentUniversity } from '@/lib/university-scope';
import { getSetting } from '@/lib/settings';
import { buildFinanceStatementVerify as buildFinanceVerify } from '@/lib/finance-verify';
import StudentStatementClient from '../StudentStatementClient';
import StudentPicker from './StudentPicker';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { students } from '@/db/schema';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'] as never[];

export default async function StudentStatementPage(props: { searchParams: Promise<{ studentId?: string; q?: string }> }) {
  await requireRole(FINANCE);
  const currentUniversity = await getCurrentUniversity();
  if (!currentUniversity) return <div className="card p-6 text-center text-slate-500">دانشگاه فعال یافت نشد</div>;

  const sp = await props.searchParams;
  const studentId = Number(sp.studentId ?? 0);
  const q = (sp.q ?? '').trim();

  if (!studentId) {
    // انتخاب دانشجو — سربرگ premium + جستجو/فیلتر/مرتب‌سازی سمت کاربر
    // picker باید فارغالتحصیلها را هم نشان دهد؛ پیشفرض ACTIVE موتور در اینجا مناسب نیست.
    // Search is applied server-side BEFORE the 500-row limit so codes past rank 500 are found.
    const students = await listFinanceStudents({ universityId: currentUniversity.id, status: 'ALL', search: q || undefined, limit: 500 });
    return <StudentPicker students={students} universityTitle={currentUniversity.title} initialQuery={q} />;
  }

  // Show statement for specific student
  const fin = await getStudentFinance(studentId, { universityId: currentUniversity.id });
  if (!fin) return <div className="card p-6 text-center text-slate-500">اطلاعات مالی یافت نشد</div>;

  return (
    <StudentStatementClient
      studentId={studentId}
      studentName={fin.student.fullName}
      studentCode={fin.student.studentCode ?? ''}
      majorCode={fin.student.majorCode}
      degreeCode={fin.student.degreeCode}
      majorTitle={fin.student.majorTitle}
      degreeTitle={fin.student.degreeTitle}
    />
  );
}