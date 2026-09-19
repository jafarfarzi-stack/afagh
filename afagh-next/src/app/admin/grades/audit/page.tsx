import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { grade_change_log, course_offerings, courses, academic_terms, users, students } from '@/db/schema';
import { desc, like, or, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function GradeAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(['ADMIN', 'GRADUATEAFFAIRS', 'EDU_EXPERT']);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const page = Math.max(parseInt(sp.page ?? '1', 10) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      id: grade_change_log.id,
      studentId: grade_change_log.studentId,
      studentCode: students.studentCode,
      action: grade_change_log.action,
      oldGradeValue: grade_change_log.oldGradeValue,
      newGradeValue: grade_change_log.newGradeValue,
      reason: grade_change_log.reason,
      actorUserId: grade_change_log.actorUserId,
      actorRole: grade_change_log.actorRole,
      createdAt: grade_change_log.createdAt,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      courseCode: courses.code,
      courseTitle: courses.title,
      termCode: academic_terms.termCode,
    })
    .from(grade_change_log)
    .leftJoin(users, sql`${users.id} = ${grade_change_log.actorUserId}`)
    .leftJoin(students, sql`${students.id} = ${grade_change_log.studentId}`)
    .leftJoin(course_offerings, sql`${course_offerings.id} = ${grade_change_log.offeringId}`)
    .leftJoin(courses, sql`${courses.id} = ${course_offerings.courseId}`)
    .leftJoin(academic_terms, sql`${academic_terms.id} = ${course_offerings.termId}`)
    .orderBy(desc(grade_change_log.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasNext = rows.length > PAGE_SIZE;
  const pageRows = hasNext ? rows.slice(0, PAGE_SIZE) : rows;
  // simple client-side filter if q provided (after fetch, for fa-normalized we do simple includes)
  const filtered = q
    ? pageRows.filter(r => {
        const hay = `${r.courseCode ?? ''} ${r.courseTitle ?? ''} ${r.studentCode ?? ''} ${r.termCode ?? ''}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : pageRows;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-lg">📜 لاگ سراسری تغییرات نمرات (Audit Trail)</h1>
        <Link href="/admin/students" className="text-xs font-bold text-indigo-700 hover:underline">← بازگشت به پرونده‌ها</Link>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="جستجو: کد درس / عنوان درس / شماره دانشجویی / ترم" className="flex-1 max-w-md bg-white border border-slate-300 rounded px-3 py-1.5 text-xs" />
        <button type="submit" className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded">جستجو</button>
        {q && <Link href="/admin/grades/audit" className="px-3 py-1.5 bg-slate-100 border border-slate-300 text-xs rounded">پاک‌سازی</Link>}
      </form>
      <div className="border border-slate-300 rounded-lg overflow-x-auto bg-white">
        <table className="w-full text-right text-[11px]">
          <thead className="bg-slate-100 border-b border-slate-300 font-bold">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">تاریخ</th>
              <th className="p-2">دانشجو</th>
              <th className="p-2">درس</th>
              <th className="p-2">ترم</th>
              <th className="p-2">عملیات</th>
              <th className="p-2 text-center">قبل → بعد</th>
              <th className="p-2">اقدام‌کننده</th>
              <th className="p-2">دلیل</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-slate-500">لاگی یافت نشد.</td></tr>
            ) : filtered.map((r, i) => (
              <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-2 font-mono text-slate-500">{offset + i + 1}</td>
                <td className="p-2 font-mono" dir="ltr">{r.createdAt ? new Date(r.createdAt as unknown as string).toLocaleString('fa-IR') : '—'}</td>
                <td className="p-2 font-mono">{r.studentCode ?? `#${r.studentId}`}</td>
                <td className="p-2"><span className="font-mono font-bold">{r.courseCode ?? '—'}</span><span className="block text-[10px] text-slate-600 truncate max-w-[180px]">{r.courseTitle ?? '—'}</span></td>
                <td className="p-2 font-mono">{r.termCode ?? '—'}</td>
                <td className="p-2"><span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-200">{r.action}</span></td>
                <td className="p-2 text-center font-mono"><span className="text-slate-500">{r.oldGradeValue ?? '—'}</span> <span className="text-slate-400">←</span> <span className="text-indigo-700 font-bold">{r.newGradeValue ?? '—'}</span></td>
                <td className="p-2"><span className="font-bold">{r.actorFirstName || r.actorLastName ? `${r.actorFirstName ?? ''} ${r.actorLastName ?? ''}`.trim() : `#${r.actorUserId ?? '—'}`}</span><span className="block text-[10px] text-slate-500 font-mono">[{r.actorRole ?? '—'}]</span></td>
                <td className="p-2 max-w-xs truncate" title={r.reason ?? undefined}>{r.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">صفحه {page.toLocaleString('fa-IR')}</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={`/admin/grades/audit?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) }).toString()}`} className="px-3 py-1.5 bg-white border border-slate-300 rounded font-bold">‹ قبلی</Link>}
          {hasNext && <Link href={`/admin/grades/audit?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) }).toString()}`} className="px-3 py-1.5 bg-indigo-700 text-white rounded font-bold">بعدی ›</Link>}
        </div>
      </div>
    </div>
  );
}
