import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';

export const dynamic = 'force-dynamic';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

type Row = Record<string, unknown>;

/** اجرای امنِ یک پرس‌وجوی فقط‌خواندنی */
async function q(statement: ReturnType<typeof sql>): Promise<Row[]> {
  try {
    const res = await db.execute(statement);
    return (res.rows ?? []) as Row[];
  } catch {
    return [];
  }
}

const fa = (n: unknown) => Number(n ?? 0).toLocaleString('fa-IR');

/**
 * گزارشِ مغایرتِ حساب — فقط‌خواندنی.
 *
 * سندِ راهنمای سما یک «نمایش مغایرت در حساب مالی دانشجو» داشت که در آفاق
 * نبود. این صفحه همان را به‌صورت «فهرستِ ناسازگاری‌های داده» پیاده می‌کند:
 * هر بخش یک نوع خطای رایج را نشان می‌دهد تا کارشناس مالی قبل از چاپِ سند
 * آن را ببیند. هیچ نوشتنی در دیتابیس انجام نمی‌شود.
 */
export default async function ReconciliationPage() {
  await requireRole(FINANCE);
  const uni = await getCurrentUniversity();
  const uniId = uni.id;

  const [dupes, noReceipt, badAmount, noTuition] = await Promise.all([
    // ۱) یک درس، دو ثبتِ فعال در همان نیمسال
    q(sql`
      select u."firstName" || ' ' || u."lastName" as student, s."studentCode" as code,
             c.code as course_code, c.title as course_title, co."termId" as term_id,
             count(*) as cnt
      from enrollments e
      join course_offerings co on co.id = e."offeringId"
      join courses c on c.id = co."courseId"
      join students s on s.id = e."studentId"
      left join users u on u.id = s."userId"
      where e.status <> 'DROPPED' and s."universityId" = ${uniId}
      group by u."firstName", u."lastName", s."studentCode", c.code, c.title, co."termId"
      having count(*) > 1
      order by count(*) desc
      limit 25
    `),
    // ۲) پرداخت بدون شمارهٔ فیش
    q(sql`
      select u."firstName" || ' ' || u."lastName" as student, s."studentCode" as code,
             l."transactionType" as ttype, l.amount, l."depositDate" as ddate, l.id
      from student_ledger l
      join students s on s.id = l."studentId"
      left join users u on u.id = s."userId"
      where l."transactionType" = 'PAYMENT'
        and (l."receiptNo" is null or btrim(l."receiptNo") = '')
        and s."universityId" = ${uniId}
      order by l.id desc
      limit 25
    `),
    // ۳) مبلغِ صفر یا منفی
    q(sql`
      select u."firstName" || ' ' || u."lastName" as student, s."studentCode" as code,
             l."transactionType" as ttype, l.amount, l.id
      from student_ledger l
      join students s on s.id = l."studentId"
      left join users u on u.id = s."userId"
      where (l.amount is null or l.amount <= 0)
        and s."universityId" = ${uniId}
      order by l.id desc
      limit 25
    `),
    // ۴) ثبت‌نامِ فعال بدون هیچ رکوردِ شهریه در همان ترم
    q(sql`
      select u."firstName" || ' ' || u."lastName" as student, s."studentCode" as code,
             co."termId" as term_id, count(*) as cnt
      from enrollments e
      join course_offerings co on co.id = e."offeringId"
      join students s on s.id = e."studentId"
      left join users u on u.id = s."userId"
      where e.status <> 'DROPPED' and s."universityId" = ${uniId}
        and not exists (
          select 1 from student_ledger l
          where l."studentId" = e."studentId"
            and l."termId" = co."termId"
            and l."transactionType" in ('TUITION_FIXED','TUITION_VARIABLE')
        )
      group by u."firstName", u."lastName", s."studentCode", co."termId"
      order by count(*) desc
      limit 25
    `),
  ]);

  const sections = [
    {
      title: 'ثبت تکراریِ یک درس در یک نیمسال',
      hint: 'باید یک ردیف باشد؛ ردیف‌های اضافی در کارنامه ادغام می‌شوند ولی دادهٔ دفتر هنوز تکراری است.',
      rows: dupes,
      cols: ['student', 'code', 'course_code', 'course_title', 'term_id', 'cnt'],
      heads: ['دانشجو', 'شمارهٔ دانشجویی', 'کد درس', 'نام درس', 'ترم', 'تعداد'],
    },
    {
      title: 'پرداختِ بدون شمارهٔ فیش',
      hint: 'برای استعلام بانکی و تطبیق، شمارهٔ فیش لازم است.',
      rows: noReceipt,
      cols: ['student', 'code', 'amount', 'ddate'],
      heads: ['دانشجو', 'شمارهٔ دانشجویی', 'مبلغ', 'تاریخ'],
    },
    {
      title: 'تراکنش با مبلغ صفر یا منفی',
      hint: 'معمولاً خطای ورود داده است و مانده را منحرف می‌کند.',
      rows: badAmount,
      cols: ['student', 'code', 'ttype', 'amount'],
      heads: ['دانشجو', 'شمارهٔ دانشجویی', 'نوع', 'مبلغ'],
    },
    {
      title: 'ثبت‌نامِ فعال بدون رکورد شهریه در همان ترم',
      hint: 'یعنی شهریه‌ای برای این ترم صادر نشده؛ ممکن است تعرفه یا انتقال ناقص باشد.',
      rows: noTuition,
      cols: ['student', 'code', 'term_id', 'cnt'],
      heads: ['دانشجو', 'شمارهٔ دانشجویی', 'ترم', 'تعداد درس'],
    },
  ];

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-4">
      <div>
        <h1 className="text-lg font-black text-slate-900">گزارش مغایرت حساب</h1>
        <p className="mt-1 text-2xs text-slate-500">
          فقط‌خواندنی — هیچ تغییری در داده‌ها اعمال نمی‌شود. هر بخش، یک نوع ناسازگاری را فهرست می‌کند.
        </p>
      </div>

      {sections.map((sec) => (
        <section key={sec.title} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <h2 className="text-sm font-black text-slate-800">{sec.title}</h2>
              <p className="text-2xs text-slate-500">{sec.hint}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-2xs font-black ${sec.rows.length ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {sec.rows.length ? `${fa(sec.rows.length)} مورد` : 'موردی نیست'}
            </span>
          </div>
          {sec.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-2xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    {sec.heads.map((h) => (
                      <th key={h} className="whitespace-nowrap border-b border-slate-200 px-2 py-1 text-right font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      {sec.cols.map((c) => (
                        <td key={c} className="whitespace-nowrap px-2 py-1 text-slate-700">
                          {c === 'amount' ? fa(r[c]) : String(r[c] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-3 py-4 text-center text-2xs text-slate-400">داده‌ای برای نمایش نیست.</p>
          )}
        </section>
      ))}
    </div>
  );
}
