'use client';

// توست بالا-چپ (خودمخفی‌شونده پس از ۴٫۲ ثانیه)
import { useCurriculum } from '../curriculum-context';

export default function CurriculumToast() {
  const {
    toast,
  } = useCurriculum();

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:right-auto sm:left-6 z-50 p-4 rounded-xl shadow-2xl border text-sm font-bold ${
          toast.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
            : toast.type === 'error' ? 'bg-rose-900 text-rose-100 border-rose-700'
            : 'bg-blue-900 text-blue-100 border-blue-700'
        }`}>
          {toast.type === 'success' ? '✅' : toast.type === 'error' ? '⚠️' : 'ℹ️'} {toast.text}
        </div>
      )}
    </>
  );
}
