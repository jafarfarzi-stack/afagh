'use client';

// مودال فقط‌خواندنی فرم اعلامی استاد (ثبت فقط از پرتال استاد)
import { usePlanning } from '../PlanningProvider';
import { faNum, DAY_NAMES } from '../planning-core';

export default function ProfAvailabilityModal() {
  const { editingProf, editingProfId, isProfAvailabilityModalOpen, realAvailRows, setIsProfAvailabilityModalOpen } = usePlanning();

  if (!(isProfAvailabilityModalOpen)) return null;

  return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 bg-indigo-950 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    📖 فرم اعلامی درٔ دسترس بودن استاد: {editingProf.name}
                  </h3>
                  <span className="text-xs text-indigo-200">
                    {editingProf.academicRank} — {editingProf.departmentName}
                  </span>
                </div>
                <button onClick={() => setIsProfAvailabilityModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
              </div>

              <div className="p-4 overflow-y-auto space-y-4 text-xs">
                {(() => {
                  const rows = realAvailRows.filter(r => r.staffId === editingProfId);
                  if (!rows.length) {
                    return (
                      <div className="text-center py-10 space-y-2">
                        <div className="text-3xl">⏳</div>
                        <div className="font-extrabold text-slate-700">این استاد هنوز درٔ دسترس بودن خود را اعلام نکرده است.</div>
                        <div className="text-[11px] text-slate-400 font-bold">فرم درٔ دسترس بودن فقط از پنل خودِ استاد (پرتال استاد → درٔ دسترس بودن) ثبت می‌شود.</div>
                      </div>
                    );
                  }
                  return (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-900 text-white text-center">
                            <th className="p-2.5 border border-slate-800 font-extrabold">روز هفته</th>
                            <th className="p-2.5 border border-slate-800 font-extrabold">از</th>
                            <th className="p-2.5 border border-slate-800 font-extrabold">تا</th>
                            <th className="p-2.5 border border-slate-800 font-extrabold">وضعیت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="p-2 border border-slate-200 font-extrabold text-center bg-slate-100 text-slate-900">
                                {r.dayOfWeek ? DAY_NAMES[(r.dayOfWeek - 1) % 6] : '—'}
                              </td>
                              <td className="p-2 border border-slate-200 text-center font-mono font-bold">{faNum(r.startTime ?? '—')}</td>
                              <td className="p-2 border border-slate-200 text-center font-mono font-bold">{faNum(r.endTime ?? '—')}</td>
                              <td className="p-2 border border-slate-200 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  r.status === 'PREF' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {r.status === 'PREF' ? '🟩 اولویت' : '🟨 قابل حضور'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-[11px] text-indigo-900 font-bold leading-relaxed">
                  🔒 این داده فقط توسط خودِ استاد ثبت می‌شود و موتور پیشنهاد (getSmartSuggestions) همین بازه‌ها را به‌عنوان
                  قید ورودی می‌خواند. ویرایش از این‌جا ممکن نیست.
                </div>
              </div>

              <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setIsProfAvailabilityModalOpen(false)}
                  className="px-5 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
  );
}
