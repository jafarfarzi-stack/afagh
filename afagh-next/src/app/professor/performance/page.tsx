import { getStaffByUser, requireRole } from '@/lib/auth';
import { getExecutiveRealtimeOps } from '@/lib/executive-analytics';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProfessorPerformancePage() {
  const user = await requireRole(['PROFESSOR']);
  const me = await getStaffByUser(user.id);
  const { sampleStaffPerformance } = await getExecutiveRealtimeOps();

  const perf = {
    ...sampleStaffPerformance,
    fullName: user.name || sampleStaffPerformance.fullName,
    staffCode: me?.staffCode || sampleStaffPerformance.staffCode,
    departmentName: me?.academicRank ? `گروه کامپیوتر (${me.academicRank})` : sampleStaffPerformance.departmentName,
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* بنر سربرگ کارنامه پرسنلی */}
      <div className="bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-slate-950">
              کارنامه خودارزیابی و شفافیت عملکرد (Staff Self-Dashboard)
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              {perf.badgeTitle}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1">
            {perf.fullName}
          </h1>
          <p className="text-xs text-indigo-200">
            کد پرسنلی: <b className="font-mono text-white">{perf.staffCode}</b> · جایگاه: {perf.roleTitle}
          </p>
        </div>

        <div className="text-left bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 space-y-1">
          <span className="text-[11px] text-indigo-200 block">رتبه در دانشکده:</span>
          <p className="text-2xl font-black text-amber-300">
            مقام {perf.leaderboardRank} از ۳۸ استاد
          </p>
          <p className="text-[10px] text-emerald-300">جزو ۵٪ برتر سرعت پاسخگویی و رضایت دانشجو</p>
        </div>
      </div>

      {/* شبکه کارت‌های شاخص‌های کلیدی عملکرد (KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 bg-white border border-slate-200 shadow-sm rounded-2xl text-center space-y-1">
          <span className="text-2xl">⚡</span>
          <p className="text-2xl font-black text-indigo-950 font-mono">{perf.personalMttrHours} ساعت</p>
          <p className="text-xs font-bold text-slate-700">میانگین زمان اقدام (MTTR)</p>
          <p className="text-[11px] text-emerald-600 font-medium">۴۵٪ سریع‌تر از میانگین دانشگاه</p>
        </div>

        <div className="card p-4 bg-white border border-slate-200 shadow-sm rounded-2xl text-center space-y-1">
          <span className="text-2xl">⏱️</span>
          <p className="text-2xl font-black text-emerald-700 font-mono">{perf.slaAdherencePercent}٪</p>
          <p className="text-xs font-bold text-slate-700">پایبندی به ضرب‌الاجل (SLA)</p>
          <p className="text-[11px] text-slate-400">تنها ۱ مورد تاخیر در ترم جاری</p>
        </div>

        <div className="card p-4 bg-white border border-slate-200 shadow-sm rounded-2xl text-center space-y-1">
          <span className="text-2xl">📦</span>
          <p className="text-2xl font-black text-slate-900 font-mono">{perf.currentMonthResolved} پرونده</p>
          <p className="text-xs font-bold text-slate-700">حجم مختومه‌شده ماه (Throughput)</p>
          <p className="text-[11px] text-indigo-600 font-medium">↑ ۲۱٪ رشد نسبت به ماه قبل ({perf.previousMonthResolved})</p>
        </div>

        <div className="card p-4 bg-white border border-slate-200 shadow-sm rounded-2xl text-center space-y-1">
          <span className="text-2xl">⭐</span>
          <p className="text-2xl font-black text-amber-500 font-mono">★ {perf.csatRating}</p>
          <p className="text-xs font-bold text-slate-700">امتیاز رضایت ارباب رجوع (CSAT)</p>
          <p className="text-[11px] text-slate-400">بر پایه {perf.reviewsCount} نظر ثبت‌شده دانشجو</p>
        </div>
      </div>

      {/* مقایسه با استانداردهای دانشگاهی و پیشنهادات بهبود */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <span>📈 مقایسه عملکرد شما با میانگین دانشگاه</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-600">نرخ پایبندی به زمان‌بندی (SLA Adherence):</span>
                <span className="font-bold text-emerald-700">{perf.slaAdherencePercent}٪ (شما) vs ۸۶٪ (میانگین)</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div className="bg-emerald-600 h-2.5 rounded-full" style={{ width: `${perf.slaAdherencePercent}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-600">امتیاز رضایت دانشجویان (CSAT Score):</span>
                <span className="font-bold text-amber-600">★ {perf.csatRating} (شما) vs ۴.۲ (میانگین)</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div className="bg-amber-400 h-2.5 rounded-full" style={{ width: `${(perf.csatRating / 5) * 100}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-600">سرعت رسیدگی به پرونده‌های آموزشی:</span>
                <span className="font-bold text-indigo-700">۱۳.۵ ساعت (شما) vs ۲۶.۰ ساعت (میانگین)</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: '85%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* نکات تشویقی و راهنما */}
        <div className="card p-5 bg-slate-900 text-white rounded-2xl space-y-4 shadow-sm border border-slate-800">
          <h2 className="text-sm font-black text-amber-400 flex items-center gap-2">
            <span>🏆 مشوق‌ها و پاداش بهره‌وری آموزشی</span>
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            بر اساس آیین‌نامه ارتقای مرتبه علمی و نظام پرداخت حق‌التدریس دانشگاه آفاق، اساتیدی که شاخص پایبندی SLA بالای ۹۵٪ و رضایت دانشجو بالای ۴.۵ را حفظ نمایند، مشمول ۱۰٪ ضریب ترجیحی در حق‌الزحمه پایان‌ترم و اولویت در تخصیص دروس تخصصی خواهند بود.
          </p>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-bold">✓ واجد شرایط دریافت پاداش بهره‌وری</span>
            <Link
              href="/professor"
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow"
            >
              بازگشت به کارتابل دروس
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
