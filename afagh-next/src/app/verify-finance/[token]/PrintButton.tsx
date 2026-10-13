'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="block w-full rounded-2xl bg-emerald-600 py-3 text-center text-xs font-black text-white shadow-lg transition hover:bg-emerald-500 print:hidden"
    >
      🖨️ چاپ این کارنامه
    </button>
  );
}
