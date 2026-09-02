import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { process_definitions, student_requests, students, users } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { gridModules } from '@/lib/admin-modules';
import { ensureWorker, waitingRoomStats, warmupCapacities } from '@/lib/waitingRoom';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import RequestActionButtons from './RequestActionButtons';
import AdminMakeupRequestsCard from './AdminMakeupRequestsCard';

async function warmupAction() {
  'use server';
  const u = await requireRole(['ADMIN']);
  if (!u.roles.includes('ADMIN')) return;
  ensureWorker();
  await warmupCapacities(true); // §۱۰۰۶: انتقال ظرفیت‌ها از DB به Redis
  revalidatePath('/admin');
}

export const dynamic = 'force-dynamic';

const ALL_ADMIN_ROLES = [
  'ADMIN',
  'EDU_EXPERT',
  'ARCHIVE_EXPERT',
  'FINANCE_EXPERT',
  'FINANCE',
  'MILITARY_OFFICER',
  'VAULT_MANAGER',
  'DEP_HEAD',
  'VICE_EDU',
];

const stFa: Record<string, string> = {
  SUBMITTED: 'ثبت‌شده',
  IN_REVIEW: 'در بررسی',
  APPROVED: 'تاییدشده',
  REJECTED: 'ردشده',
  RETURNED: 'بازگشتی',
};

const stColor: Record<string, string> = {
  SUBMITTED: 'bg-amber-100 text-amber-800 border border-amber-300',
  IN_REVIEW: 'bg-sky-100 text-sky-800 border border-sky-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 border border-red-300',
  RETURNED: 'bg-purple-100 text-purple-800 border border-purple-300',
};

export default async function AdminHome() {
  const user = await requireRole(ALL_ADMIN_ROLES);
  const isEdu = user.roles.includes('ADMIN') || user.roles.includes('EDU_EXPERT');
  const mods = gridModules(user.roles);

  let total = 0;
  let counts: { status: string; n: number }[] = [];
  let inbox: any[] = [];
  let wr: Awaited<ReturnType<typeof waitingRoomStats>> | null = null;

  if (isEdu) {
    ensureWorker();
    wr = await waitingRoomStats();
    counts = await db
      .select({ status: student_requests.status, n: sql<number>`count(*)::int` })
      .from(student_requests)
      .groupBy(student_requests.status);
    total = counts.reduce((s, c) => s + c.n, 0);
    inbox = await db
      .select({
        id: student_requests.id,
        track: student_requests.trackingCode,
        status: student_requests.status,
        created: student_requests.createdAt,
        formData: student_requests.formData,
        name: users.firstName,
        family: users.lastName,
        code: students.studentCode,
        procTitle: process_definitions.title,
      })
      .from(student_requests)
      .innerJoin(students, eq(students.id, student_requests.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .leftJoin(process_definitions, eq(process_definitions.id, student_requests.processId))
      .orderBy(desc(student_requests.id))
      .limit(20);
  }

  return (
    <div className="space-y-5">
      {/* ═══ شبکهٔ کارت‌های ماژول‌ها — فقط ماژول‌های مجازِ نقش کاربر ═══ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-extrabold text-slate-800 text-base sm:text-lg">ماژول‌های سامانه</h1>
          <span className="text-xs text-slate-500">{mods.length} ماژول در دسترس نقش شما</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {mods.map(m => (
            <Link
              key={m.href}
              href={m.href}
              className={`group p-4 rounded-2xl bg-gradient-to-br ${m.accent} text-white shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-start justify-between border`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 shrink-0 rounded-xl ${m.iconBg} border flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform`}>
                  {m.icon}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm leading-6">{m.title}</h3>
                  <p className="text-[11px] text-white/70 mt-1 leading-5">{m.desc}</p>
                </div>
              </div>
              <span className="text-white/50 font-extrabold text-sm group-hover:text-white group-hover:-translate-x-1 transition-all mt-1">
                ←
              </span>
            </Link>
          ))}
        </div>
      </section>

      {isEdu && (
        <>
          {/* کارت‌های خلاصه وضعیت کل سیستم */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="card text-center">
              <p className="text-2xl font-bold text-indigo-700">{total}</p>
              <p className="text-xs text-slate-500">کل درخواست‌ها</p>
            </div>
            {['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED'].map(k => {
              const n = counts.find(c => c.status === k)?.n ?? 0;
              return (
                <div key={k} className="card text-center">
                  <p className="text-2xl font-bold text-slate-700">{n}</p>
                  <p className="text-xs text-slate-500">{stFa[k]}</p>
                </div>
              );
            })}
          </div>

          {/* کارتابل درخواست‌های کلاس جبرانی اساتید */}
          <AdminMakeupRequestsCard />

          {/* وضعیت موتور صف Redis */}
          {wr && (
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
          )}

          {/* جدول کارتابل گردش کار و اقدامات دانشجویی */}
          <div className="card">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <h2 className="font-bold text-slate-800">کارتابل رسیدگی به درخواست‌های دانشجویی (شورای آموزشی)</h2>
              <span className="text-xs text-slate-500">{inbox.length} پرونده اخیر</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200">
                    <th className="p-2.5">کد رهگیری</th>
                    <th className="p-2.5">دانشجو</th>
                    <th className="p-2.5">موضوع / درس</th>
                    <th className="p-2.5">وضعیت</th>
                    <th className="p-2.5">زمان</th>
                    <th className="p-2.5 text-left">اقدام شورا</th>
                  </tr>
                </thead>
                <tbody>
                  {inbox.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        درخواستی در کارتابل موجود نیست.
                      </td>
                    </tr>
                  )}
                  {inbox.map(r => {
                    let extra: any = {};
                    try {
                      if (r.formData) extra = JSON.parse(r.formData);
                    } catch (_) {}

                    return (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors">
                        <td className="p-2.5 font-mono text-xs font-bold text-slate-700" dir="ltr">
                          {r.track}
                        </td>
                        <td className="p-2.5">
                          <p className="font-semibold text-slate-800">{r.name} {r.family}</p>
                          <p className="text-[11px] font-mono text-slate-400" dir="ltr">{r.code}</p>
                        </td>
                        <td className="p-2.5">
                          <p className="text-xs font-medium text-slate-700">
                            {extra.offeringTitle ? `اخذ درس ${extra.offeringTitle}` : (r.procTitle || 'کمیسیون موارد خاص')}
                          </p>
                          {extra.reasons && (
                            <p className="text-[10px] text-amber-700 mt-0.5 truncate max-w-[200px]" title={extra.reasons.join('، ')}>
                              {extra.reasons.join('، ')}
                            </p>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span className={'inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ' + (stColor[r.status] ?? '')}>
                            {stFa[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-xs text-slate-500">
                          {r.created ? new Date(r.created).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </td>
                        <td className="p-2.5 text-left">
                          <RequestActionButtons requestId={r.id} status={r.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
