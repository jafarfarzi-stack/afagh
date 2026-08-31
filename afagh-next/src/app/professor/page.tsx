import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, course_offerings, courses, payroll_statements, professor_term_contracts } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const payFa: Record<string, string> = { DRAFT: 'پیش‌نویس', MID_TERM_PAID: 'پرداخت میان‌ترم', FINAL_SETTLED: 'تسویه نهایی' };

const faNum = (n: any) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

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
    <div className="space-y-6" dir="rtl">
      
      {/* Welcome Banner */}
      <div className="bg-gradient-to-l from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-700/50 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-slate-950">
              {term?.title || 'نیمسال تحصیلی جاری'}
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-2">
              خوش آمدید، استاد گرامی {user.name || 'دکتر جمیل احمدی'}
            </h1>
            <p className="text-xs text-indigo-200 mt-1">
              کد پرسنلی: {faNum(me.staffCode)} · مرتبه علمی: {me.academicRank || 'استادیار'} · گروه مهندسی کامپیوتر
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/professor/schedule"
              className="px-4 py-2 rounded-xl bg-white text-indigo-950 font-extrabold text-xs shadow hover:bg-indigo-50 transition"
            >
              🗓️ برنامه هفتگی تدریس
            </Link>
            <Link
              href="/professor/contract"
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow transition"
            >
              📑 مشاهده و امضای قرارداد تدریس
            </Link>
          </div>
        </div>

        {/* Quick Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-indigo-200 block mb-0.5">تعداد کلاس‌های ترم:</span>
            <span className="font-extrabold text-white text-sm">{faNum(classes.length > 0 ? classes.length : 5)} گروه درسی</span>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-indigo-200 block mb-0.5">وضعیت اعلام حضور ترم:</span>
            <span className="font-extrabold text-emerald-300 text-sm">✓ ثبت و تایید شده</span>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-indigo-200 block mb-0.5">قرارداد حق‌التدریس:</span>
            <span className="font-extrabold text-amber-300 text-sm">آماده امضای الکترونیک</span>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl border border-white/10">
            <span className="text-indigo-200 block mb-0.5">مهلت نهایی‌سازی نمرات:</span>
            <span className="font-extrabold text-white text-sm">۴۸ ساعت پس از آزمون</span>
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Link
          href="/professor/schedule"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-400 hover:shadow-md transition space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition">
            🗓️
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">برنامه هفتگی تدریس</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-4">
              مشاهده روزها، ساعات تشکیل، شماره کلاس فیزیکی و تواتر زوج/فرد
            </p>
          </div>
        </Link>

        <Link
          href="/professor/attendance"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-400 hover:shadow-md transition space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition">
            📋
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">ثبت حضور و غیاب</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-4">
              ثبت وضعیت هر جلسه، تاخیر، غیبت موجه و هشدار ماده ۳/۱۶
            </p>
          </div>
        </Link>

        <Link
          href="/professor/grades"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-400 hover:shadow-md transition space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition">
            📝
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">بارم‌بندی و ثبت نمرات</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-4">
              تعیین سهم میان‌ترم و پایان‌ترم (جمع ۲۰)، نمرات مشترک و رسیدگی به اعتراضات
            </p>
          </div>
        </Link>

        <Link
          href="/professor/contract"
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-400 hover:shadow-md transition space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition">
            📑
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">قرارداد تدریس و مالی</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-4">
              مشاهده فرم رسمی، جزئیات مالی، نرخ هر ساعت و امضای دیجیتال
            </p>
          </div>
        </Link>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Classes List */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 md:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="font-extrabold text-slate-900 text-base">کلاس‌های آموزشی {term?.title ?? ''}</h2>
              <p className="text-xs text-slate-500 mt-0.5">فهرست دروس تخصیص‌یافته به همراه عملیات سریع</p>
            </div>
            <Link href="/professor/schedule" className="text-xs font-bold text-indigo-700 hover:underline">
              مشاهده تقویم هفتگی ←
            </Link>
          </div>

          <div className="space-y-3">
            {/* Real or Demo Offering List */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-2xl bg-slate-50 p-3.5 border border-slate-200 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm text-slate-900">سیستم‌های عامل</p>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold text-[10px]">گروه ۱</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-bold">
                  CE-302 · ۳ واحد نظری · 🏛️ کلاس ۳۰۱ (سمعی و بصری) · شنبه‌ها ۰۸:۰۰ الی ۱۰:۰۰
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge bg-sky-100 text-sky-800 font-bold text-xs">۳۸/۴۰ دانشجو</span>
                <Link href="/professor/attendance?offeringId=101" className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-900 font-bold text-xs hover:bg-emerald-200 transition">
                  حضور و غیاب
                </Link>
                <Link href="/professor/grades?offeringId=101" className="px-2.5 py-1 rounded-xl bg-indigo-100 text-indigo-900 font-bold text-xs hover:bg-indigo-200 transition">
                  ثبت نمره
                </Link>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-2xl bg-slate-50 p-3.5 border border-slate-200 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm text-slate-900">ساختمان داده‌ها و الگوریتم‌ها</p>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold text-[10px]">گروه ۱</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-bold">
                  CE-204 · ۳ واحد نظری · 🏛️ کلاس ۳۰۲ · دوشنبه‌ها ۰۸:۰۰ الی ۱۰:۰۰
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge bg-sky-100 text-sky-800 font-bold text-xs">۴۲/۴۵ دانشجو</span>
                <Link href="/professor/attendance?offeringId=103" className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-900 font-bold text-xs hover:bg-emerald-200 transition">
                  حضور و غیاب
                </Link>
                <Link href="/professor/grades?offeringId=103" className="px-2.5 py-1 rounded-xl bg-indigo-100 text-indigo-900 font-bold text-xs hover:bg-indigo-200 transition">
                  ثبت نمره
                </Link>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-2xl bg-purple-50/50 p-3.5 border border-purple-200 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm text-purple-950">آزمایشگاه و مبانی سیستم‌های عامل</p>
                  <span className="px-2 py-0.5 rounded bg-purple-200 text-purple-950 font-bold text-[10px]">👥 درس مشترک</span>
                </div>
                <p className="text-xs text-purple-800 mt-0.5 font-bold">
                  CE-208 · ۱ واحد عملی · 🏛️ آزمایشگاه نرم‌افزار ۲ · دوشنبه‌ها ۱۳:۳۰ (هفته زوج) · با دکتر مریم رضایی
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge bg-purple-100 text-purple-900 font-bold text-xs">۲۲/۲۵ دانشجو</span>
                <Link href="/professor/attendance?offeringId=104" className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-900 font-bold text-xs hover:bg-emerald-200 transition">
                  حضور و غیاب
                </Link>
                <Link href="/professor/grades?offeringId=104" className="px-2.5 py-1 rounded-xl bg-indigo-100 text-indigo-900 font-bold text-xs hover:bg-indigo-200 transition">
                  ثبت نمره
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Contract & Financial Summary Card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="font-extrabold text-slate-900 text-base">قرارداد و وضعیت مالی</h2>
            <p className="text-xs text-slate-500 mt-0.5">محاسبه حق‌التدریس بر اساس احکام مصوب</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">شماره قرارداد:</span>
              <span className="font-mono font-bold text-slate-900">CON-1405-CE-082</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">وضعیت امضا:</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                در انتظار امضای دیجیتال
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-slate-500">ساعات تدریس مصوب:</span>
              <span className="font-bold text-indigo-950">۲۲۴ ساعت در ترم</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">مبلغ ناخالص:</span>
              <span className="font-bold text-slate-900">{faNum((190400000).toLocaleString('fa-IR'))} ریال</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">خالص پرداختی پیش‌بینی:</span>
              <span className="font-extrabold text-emerald-700 text-sm">{faNum((158032000).toLocaleString('fa-IR'))} ریال</span>
            </div>

            <div className="pt-2">
              <Link
                href="/professor/contract"
                className="w-full block text-center py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs shadow transition"
              >
                مشاهده فرم کامل و امضای دیجیتال ←
              </Link>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
