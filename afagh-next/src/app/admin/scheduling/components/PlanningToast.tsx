'use client';

// توست بالا-چپ (خودمخفی‌شونده پس از ۴٫۵ ثانیه)
import { usePlanning } from '../PlanningProvider';

export default function PlanningToast() {
  const { setToastMessage, toastMessage } = usePlanning();

  if (!(toastMessage)) return null;

  return (
          <div className={`fixed top-4 left-4 right-4 sm:right-auto sm:left-6 z-50 p-4 rounded-xl shadow-2xl border flex items-center justify-between gap-3 text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-300 ${
            toastMessage.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-700' :
            toastMessage.type === 'info' ? 'bg-blue-900 text-blue-100 border-blue-700' :
            'bg-amber-900 text-amber-100 border-amber-700'
          }`}>
            <div className="flex items-center gap-2">
              <span>{toastMessage.type === 'success' ? '✅' : toastMessage.type === 'info' ? 'ℹ️' : '⚠️'}</span>
              <span>{toastMessage.text}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white text-xs">✕</button>
          </div>
  );
}
