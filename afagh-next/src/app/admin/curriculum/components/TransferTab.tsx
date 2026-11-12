'use client';

// تب ۵: انتقال/کپی کاتالوگ به رشتهٔ دیگر
import { useCurriculum } from '../curriculum-context';
import { faDate, faNum } from '../curriculum-core';

export default function TransferTab() {
  const {
    activeTab,
    busy,
    handleCreateRevision,
    handleTransferToMajor,
    handleUndoTransfer,
    majors,
    reloadTransfers,
    selectedMajorId,
    selectedVersion,
    setTransferEntryTermId,
    setTransferMajorId,
    terms,
    transferEntryTermId,
    transferMajorId,
    transfers,
    transfersLoading,
  } = useCurriculum();

  if (!selectedVersion) return null;

  return (
    <>
      {/* انتقال کاتالوگ — تب: انتقال کاتالوگ */}
      {activeTab === 'TRANSFER' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <h4 className="font-extrabold text-slate-900 text-sm">🔄 انتقال / کپی عمیق کاتالوگ «{selectedVersion.versionCode}»</h4>
          <p className="text-2xs text-slate-500 font-bold leading-relaxed">
            کپی عمیق = کل چارت (دروس + پیشنیازها + همنیازها + ترمبندی + نمرهها + سقف واحد) به یک نسخهٔ جدید منتقل میشود؛ هیچ دادهٔ مشترکی بین دو نسخه باقی نمیماند.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <span className="font-black text-xs text-slate-800">1️⃣ نسخهٔ جدید (R+1) از همین نسخه</span>
              <p className="text-2xs text-slate-500 font-bold">مناسب اصلاحات پس از انتشار/تأیید — نسخههای نهایی هرگز درجا ویرایش نمیشوند.</p>
              <button
                onClick={handleCreateRevision}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs disabled:opacity-50"
              >
                🔁 ایجاد نسخهٔ جدید R+1
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <span className="font-black text-xs text-slate-800">2️⃣ کپی به رشتهٔ دیگر (انتقال چارت)</span>
              <p className="text-2xs text-slate-500 font-bold">همان کاتالوگ به یک رشتهٔ مقصد کپی میشود (نسخهٔ DRAFT در مقصد).</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-40 text-2xs font-bold text-slate-600">
                  رشتهٔ مقصد:
                  <select
                    value={transferMajorId || selectedMajorId}
                    onChange={e => setTransferMajorId(Number(e.target.value))}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white text-xs"
                  >
                    {majors.map(m => (
                      <option key={m.id} value={m.id}>{m.name}{m.degreeTitle ? ` — ${m.degreeTitle}` : ''}</option>
                    ))}
                  </select>
                </label>
                {/* نیم‌سال ورودی نسخهٔ مقصد — بدون آن، نسخهٔ کپی‌شده روی «همه نیم‌سال‌ها»
                    می‌افتد و با چارت‌های دیگر تداخل می‌کند */}
                <label className="flex-1 min-w-40 text-2xs font-bold text-slate-600">
                  نیم‌سال ورودی (اختیاری):
                  <select
                    value={transferEntryTermId || 0}
                    onChange={e => setTransferEntryTermId(Number(e.target.value))}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 font-bold bg-white text-xs"
                  >
                    <option value={0}>همه نیم‌سال‌ها (تعیین‌نشده)</option>
                    {terms.map(t => (
                      <option key={t.id} value={t.id}>{t.title}{t.termCode ? ` (${t.termCode})` : ''}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={handleTransferToMajor}
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs disabled:opacity-50"
                >
                  ⇄ انتقال کاتالوگ
                </button>
              </div>
              <p className="text-3xs text-slate-400 font-bold">
                اگر «نیم‌سال ورودی» را تعیین کنید، نسخهٔ مقصد فقط به دانشجویان همان نیم‌سال ورودی تخصیص می‌یابد؛
                تعیین‌نکردن آن یعنی نسخه برای همهٔ نیم‌سال‌ها معتبر است (و ممکن است با چارت قبلی تداخل کند).
              </p>
              {terms.length === 0 && (
                <p className="text-3xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  ⚠️ فهرست نیم‌سال‌ها خالی است — هنوز هیچ نیم‌سال مالی در سیستم تعریف نشده است.
                  ابتدا از بخش «📅 نیمسال‌ها» در پنل مدیریت نیم‌سال‌ها را تعریف کنید تا این فهرست پر شود.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-2xs font-bold text-amber-900">
            💡 همچنین میتوانید از دکمهٔ «➕ نسخهٔ جدید» در بالای صفحه استفاده کنید و «کپی عمیق از نسخهٔ دیگر» را انتخاب نمایید.
          </div>
          {/* ── لغو انتقال: بازگرداندن رشتهٔ مقصد به وضعیت قبل ── */}
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-xs text-rose-900">↩️ لغو انتقال — بازگرداندن رشتهٔ مقصد</span>
              <button
                onClick={reloadTransfers}
                disabled={transfersLoading}
                className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-800 font-extrabold text-3xs hover:bg-rose-100 disabled:opacity-50"
              >
                🔄 به‌روزرسانی
              </button>
            </div>
            <p className="text-2xs text-rose-900/80 font-bold leading-relaxed">
              اگر انتقال را اشتباه زدید، از این‌جا لغو کنید: نسخهٔ کپی‌شده (که هنوز پیش‌نویس است) با
              دروس و قواعدش حذف می‌شود و رشتهٔ مقصد دقیقاً به وضعیت قبل از انتقال برمی‌گردد.
              فقط انتقال‌هایی که <span className="font-black">هنوز منتشر/تأیید نشده‌اند</span> قابل لغو هستند.
            </p>

            {transfersLoading && (
              <p className="text-2xs font-bold text-rose-700">⏳ در حال خواندن انتقال‌های اخیر…</p>
            )}

            {!transfersLoading && transfers.length === 0 && (
              <p className="text-2xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                انتقالِ قابل لغوی وجود ندارد. هر انتقالی که از این صفحه انجام دهید، تا زمانی که منتشر نشود، همین‌جا فهرست می‌شود.
              </p>
            )}

            {!transfersLoading && transfers.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs rt">
                  <thead>
                    <tr className="bg-rose-900 text-white text-center">
                      <th className="p-2 border border-rose-800">کد نسخه</th>
                      <th className="p-2 border border-rose-800">رشتهٔ مقصد</th>
                      <th className="p-2 border border-rose-800">منبع انتقال</th>
                      <th className="p-2 border border-rose-800">دروس</th>
                      <th className="p-2 border border-rose-800">تاریخ</th>
                      <th className="p-2 border border-rose-800 w-32">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map(t => (
                      <tr key={t.id} className="text-center bg-white hover:bg-rose-50/60">
                        <td className="p-2 border border-rose-100 font-mono font-black text-rose-900">{t.versionCode}</td>
                        <td className="p-2 border border-rose-100 font-bold text-slate-800 text-right">{t.majorName}</td>
                        <td className="p-2 border border-rose-100 font-bold text-slate-600 text-right">{t.sourceNote ?? '—'}</td>
                        <td className="p-2 border border-rose-100 font-extrabold">{faNum(t.courseCount)}</td>
                        <td className="p-2 border border-rose-100 font-bold text-slate-600">{faDate(t.createdAt)}</td>
                        <td className="p-2 border border-rose-100">
                          <button
                            onClick={() => handleUndoTransfer(t)}
                            disabled={busy}
                            title="حذف نسخهٔ کپی‌شده و بازگشت رشتهٔ مقصد به وضعیت قبل از انتقال"
                            className="px-3 py-1.5 rounded-lg font-extrabold text-2xs bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40"
                          >
                            ↩️ لغو انتقال
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
