'use client';

// دکمهٔ «چاپ چارت» برای مدیر گروه — با قواعد @media print در globals.css
// فقط جدول ترم‌بندی چاپ می‌شود (سربرگ/تب‌ها/دکمه‌ها با print:hidden پنهان‌اند).
export default function PrintChartButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="چاپ یا ذخیرهٔ PDF از چارت ترم‌بندی"
      className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs border border-white/20 transition"
    >
      🖨️ چاپ چارت
    </button>
  );
}
