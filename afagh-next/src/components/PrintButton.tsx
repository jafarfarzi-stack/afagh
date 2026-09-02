'use client';

/** دکمهٔ چاپ — با قواعد @media print در globals.css فقط خودِ فرم چاپ می‌شود */
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs px-3 py-1.5 font-medium transition-colors shadow-sm print:hidden"
    >
      <span>🖨️</span>
      <span>چاپ / ذخیره PDF</span>
    </button>
  );
}
