'use client';

// ════════════════════════════════════════════════════════════════════════
// کارت «جزئیات بارگذاری نشد» — پوشش حالتِ سفید.
//
// چرا لازم است: هر چهار تب (دروس/ترم‌بندی/بررسی/انتقال) وقتی `detail` تهی
// باشد چیزی رندر نمی‌کنند. قبلاً اگر Promise سرور-اکشن reject می‌شد (قطعی
// شبکه، 502، تایم‌اوت) کاربر یک ناحیهٔ کاملاً خالی می‌دید — بدون هیچ پیام یا
// راهی برای بازیابی. این کارت هم دلیل را می‌گوید هم «تلاش دوباره» می‌دهد.
// ════════════════════════════════════════════════════════════════════════
import { useCurriculum } from '../curriculum-context';

export default function DetailFallback() {
 const { detailError, detailLoading, reloadDetail, selectedVersionId } = useCurriculum();

 if (detailLoading) {
 return (
 <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
 <div className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-500">
 <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
 در حال بارگذاری جزئیات نسخه…
 </div>
 </div>
 );
 }

 return (
 <div className="bg-white rounded-2xl shadow-sm border border-rose-200 p-6 text-center space-y-3">
 <div className="text-2xl">⚠️</div>
 <h4 className="font-extrabold text-slate-900 text-sm">جزئیات این نسخه بارگذاری نشد</h4>
 <p className="text-2xs font-bold text-slate-600 max-w-xl mx-auto leading-relaxed">
 {detailError
 ? <>خطای سرور: <span className="font-mono text-rose-800">{detailError}</span></>
 : 'پاسخی از سرور نرسید — احتمالاً اتصال لحظه‌ای قطع شده یا نشست منقضی شده است.'}
 </p>
 <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
 <button
 onClick={() => { if (selectedVersionId != null) reloadDetail(selectedVersionId); }}
 className="px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-2xs transition-colors"
 >
 🔁 تلاش دوباره
 </button>
 <button
 onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
 className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-extrabold text-2xs transition-colors"
 >
 🔄 بارگذاری مجدد صفحه
 </button>
 </div>
 </div>
 );
}
