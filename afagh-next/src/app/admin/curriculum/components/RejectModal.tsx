'use client';

// مودال: رد نسخه با یادداشت
import { useCurriculum } from '../curriculum-context';

export default function RejectModal() {
  const {
    busy,
    handleReject,
    modal,
    rejectNote,
    setModal,
    setRejectNote,
  } = useCurriculum();

  return (
    <>
      {/* ── Modal: Reject with note ── */}
      {modal === 'REJECT' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">✕ رد نسخه و بازگشت به پیش‌نویس</h3>
            <label className="block text-xs font-bold text-slate-700">
              دلیل رد (الزامی):
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                rows={3}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button
                onClick={() => rejectNote.trim() && handleReject(rejectNote.trim())}
                disabled={busy || !rejectNote.trim()}
                className="px-5 py-1.5 rounded-lg bg-rose-600 text-white font-extrabold text-xs disabled:opacity-50"
              >
                ثبت رد
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
