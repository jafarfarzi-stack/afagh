import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { student_requests, students, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { ensureWorker, waitingRoomStats, warmupCapacities } from '@/lib/waitingRoom';
import { revalidatePath } from 'next/cache';

async function warmupAction() {
  'use server';
  const u = await requireRole(['ADMIN']);
  if (!u.roles.includes('ADMIN')) return;
  ensureWorker();
  await warmupCapacities(true); // §۱۰۰۶: انتقال ظرفیت‌ها از DB به Redis
  revalidatePath('/admin');
}

export const dynamic = 'force-dynamic';

const stFa: Record<string, string> = { SUBMITTED: 'ثبت‌شده', IN_REVIEW: 'در بررسی', APPROVED: 'تاییدشده', REJECTED: 'ردشده', RETURNED: 'بازگشتی' };
const stColor: Record<string, string> = { SUBMITTED: 'bg-slate-100 text-slate-700', IN_REVIEW: 'bg-sky-100 text-sky-800', APPROVED: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-red-100 text-red-700', RETURNED: 'bg-amber-100 text-amber-800' };

export default async function AdminHome() {
  await requireRole(['ADMIN']);
  ensureWorker();
  const wr = await waitingRoomStats();

  const counts = await db.select({ status: student_requests.status, n: sql<number>`count(*)::int` }).from(student_requests).groupBy(student_requests.status);
  const total = counts.reduce((s, c) => s + c.n, 0);

  const inbox = await db
    .select({ id: student_requests.id, track: student_requests.trackingCode, status: student_requests.status, created: student_requests.createdAt, name: users.firstName, family: users.lastName, code: students.studentCode })
    .from(student_requests)
    .innerJoin(students, eq(students.id, student_requests.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .orderBy(desc(student_requests.updatedAt)).limit(15);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card text-center"><p className="text-2xl font-bold text-indigo-700">{total}</p><p className="text-xs text-slate-500">کل درخواست‌ها</p></div>
        {['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED'].map(k => {
          const n = counts.find(c => c.status === k)?.n ?? 0;
          return <div key={k} className="card text-center"><p className="text-2xl font-bold text-slate-700">{n}</p><p className="text-xs text-slate-500">{stFa[k]}</p></div>;
        })}
      </div>
      <div className={'card flex flex-wrap items-center justify-between gap-3 ' + (wr.up ? 'border-emerald-300' : 'border-red-300')}>
        <div>
          <h2 className="font-bold">اتاق انتظار Redis (§۶۹۰۶)</h2>
          <p className="text-xs text-slate-500">
            {wr.up
              ? 'فعال — ' + wr.warmedOfferings + ' کلاس گرم‌شده · صف ثبت نهایی: ' + wr.queueLength + ' درخواست'
              : 'Redis در دسترس نیست — موتور به شمارش SQL برمی‌گردد (حالت تداوم)'}
          </p>
        </div>
        <form action={warmupAction}>
          <button className="btn-primary !py-1.5 text-xs">گرم‌کردن مجدد ظرفیت‌ها (شب قبل §۱۰۰۶)</button>
        </form>
      </div>
      <div className="card">
        <h2 className="mb-3 font-bold">آخرین درخواست‌های گردش کار</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead><tr className="text-xs text-slate-500"><th className="p-2">کد رهگیری</th><th className="p-2">دانشجو</th><th className="p-2">شماره دانشجویی</th><th className="p-2">وضعیت</th><th className="p-2">زمان</th></tr></thead>
            <tbody>
              {inbox.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-400">درخواستی ثبت نشده است.</td></tr>}
              {inbox.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-2 font-mono text-xs" dir="ltr">{r.track}</td>
                  <td className="p-2">{r.name} {r.family}</td>
                  <td className="p-2 font-mono text-xs" dir="ltr">{r.code}</td>
                  <td className="p-2"><span className={'badge ' + (stColor[r.status] ?? '')}>{stFa[r.status] ?? r.status}</span></td>
                  <td className="p-2 text-xs text-slate-500">{r.created ? new Date(r.created).toLocaleString('fa-IR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
