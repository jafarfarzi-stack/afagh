'use client';

// مودال: ویرایش مشخصات نسخهٔ پیش‌نویس (کد/عنوان/ورودی/واحد الزامی/سقف ترم)
import { useCurriculum } from '../curriculum-context';

export default function EditVersionModal() {
  const {
    busy,
    editVersionForm,
    handleUpdateVersion,
    modal,
    setEditVersionForm,
    setModal,
  } = useCurriculum();

  return (
    <>
      {modal === 'EDIT_VERSION' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900 text-sm">✏️ ویرایش مشخصات نسخه (فقط پیش‌نویس)</h3>
            <div className="space-y-2 text-xs">
              <label className="block font-bold text-slate-700">
                کد نسخه:
                <input value={editVersionForm.versionCode} onChange={e => setEditVersionForm({ ...editVersionForm, versionCode: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-mono font-bold" />
              </label>
              <label className="block font-bold text-slate-700">
                عنوان:
                <input value={editVersionForm.title} onChange={e => setEditVersionForm({ ...editVersionForm, title: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block font-bold text-slate-700">
                  ورودی از:
                  <input type="number" value={editVersionForm.entryYearFrom} onChange={e => setEditVersionForm({ ...editVersionForm, entryYearFrom: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
                <label className="block font-bold text-slate-700">
                  ورودی تا (خالی = به بعد):
                  <input value={editVersionForm.entryYearTo} onChange={e => setEditVersionForm({ ...editVersionForm, entryYearTo: e.target.value })}
                    placeholder="مثلاً ۱۴۰۸" className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
                <label className="block font-bold text-slate-700">
                  کل واحد الزامی:
                  <input type="number" value={editVersionForm.totalRequiredUnits} onChange={e => setEditVersionForm({ ...editVersionForm, totalRequiredUnits: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
                <label className="block font-bold text-slate-700">
                  سقف واحد ترم:
                  <input type="number" value={editVersionForm.maxUnitsPerTerm} onChange={e => setEditVersionForm({ ...editVersionForm, maxUnitsPerTerm: Number(e.target.value) })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2" />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 font-bold">
                سهم واحد هر نقش از تب «بررسی و خاتمه» تنظیم می‌شود؛ پس از ذخیره، اعتبارسنجی را دوباره اجرا کنید.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs">انصراف</button>
              <button onClick={handleUpdateVersion} disabled={busy} className="px-5 py-1.5 rounded-lg bg-indigo-700 text-white font-extrabold text-xs disabled:opacity-50">
                ذخیره تغییرات
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
