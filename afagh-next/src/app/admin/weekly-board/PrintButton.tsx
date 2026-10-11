'use client';

/** دکمهٔ چاپ سردر — کلاینت جدا چون Server Component نمی‌تواند onClick بگیرد. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-slate-800 px-5 py-2 text-white font-black text-sm print:hidden"
    >
      🖨️ چاپ سردر
    </button>
  );
}
