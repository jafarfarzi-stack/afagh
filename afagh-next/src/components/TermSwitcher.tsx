import type { TermScope } from '@/lib/term-scope';

/**
 * انتخاب «نیمسال فعال» — با POST ساده به `/api/scope/term`.
 *
 * ⚠ چرا `<details>` بومی و نه دکمهٔ React؟
 *   نسخهٔ قبلی با `useState` باز/بسته می‌شد. اگر هایدریشن صفحه به هر دلیلی
 *   انجام نشود (باندل کهنه پس از استقرار، خطای JS، شبکهٔ کند)، کلیک روی دکمه
 *   هیچ کاری نمی‌کند و کاربر فکر می‌کند «سوییچر خراب است» — در حالی که
 *   Route Handler سالم است. `<details>/<summary>` رفتارش را خودِ مرورگر
 *   می‌دهد: **بدون یک خط جاوااسکریپت** باز می‌شود و فرم‌ها هم POST معمولی‌اند.
 *
 * نکته: چون فرم، صفحه را با POST کامل ترک می‌کند، بستن دستی لازم نیست؛
 * صفحهٔ بعدی با کوکی جدید از نو رندر می‌شود.
 */
export default function TermSwitcher({
  terms,
  selectedId,
}: {
  terms: TermScope[];
  selectedId: number | null;
  /** دیگر لازم نیست؛ دانشگاه از کوکی معتبر سرور خوانده می‌شود */
  effectiveId?: number | null;
}) {
  if (!terms || terms.length === 0) return null;

  const current = terms.find(t => t.id === selectedId) ?? null;

  const rowClass = (active: boolean) =>
    `flex w-full items-center gap-2 px-3 py-2 text-right text-xs transition-colors ${active ? 'bg-slate-700 font-extrabold text-white' : 'text-slate-200 hover:bg-slate-800'}`;

  return (
    <details className="relative">
      <summary
        title="نیمسال فعال — همهٔ فهرست‌ها و کارنامه‌ها بر اساس این انتخاب فیلتر می‌شوند"
        className="list-none [&::-webkit-details-marker]:hidden bg-white/15 hover:bg-white/25 border-white/25 text-white border rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer flex items-center gap-1.5 select-none"
      >
        <span className="text-[10px] opacity-70">🗓</span>
        {/* برچسب «نیمسال» فقط از sm به بالا — در موبایل جا را برای سوییچر
            کارتابل باز می‌کند تا هر دو در یک ردیف سربرگ جا شوند */}
        <span className="hidden sm:inline text-[10px] opacity-80">نیمسال</span>
        <span className="max-w-24 sm:max-w-36 truncate">{current ? current.title : 'همهٔ نیمسال‌ها'}</span>
        <span className="text-[10px] opacity-70">▾</span>
      </summary>
      {/* در موبایل به‌شکل «شیت» تمام‌عرض از پایین باز می‌شود؛ `absolute` در
          RTL بسته به جای دکمه، از یک لبه بیرون می‌زد و عنوان ترم‌ها بریده
          می‌شد. از md به بالا همان منوی کشوییِ چسبیده به دکمه است. */}
      <div className="fixed inset-x-2 bottom-2 z-[60] max-h-[65vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:mt-1 md:max-h-none md:min-w-56 md:overflow-hidden md:rounded-xl">
        <div className="max-h-80 overflow-y-auto py-1">
          <form action="/api/scope/term" method="post" className="block">
            <input type="hidden" name="termId" value="" />
            <button type="submit" className={rowClass(selectedId == null)}>
              <span className="flex-1 truncate">همهٔ نیمسال‌ها</span>
              {selectedId == null && <span className="text-emerald-400 font-bold">✓</span>}
            </button>
          </form>
          <div className="my-1 border-t border-white/10" />
          {terms.map(t => {
            const active = t.id === selectedId;
            return (
              <form key={t.id} action="/api/scope/term" method="post" className="block">
                <input type="hidden" name="termId" value={t.id} />
                <button type="submit" className={rowClass(active)}>
                  <span className="flex-1 truncate">
                    {t.title}
                    <span className="opacity-60 font-mono" dir="ltr"> ({t.termCode})</span>
                  </span>
                  {t.isEffectiveCurrent && (
                    <span className="shrink-0 text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                      نیمسال جاری
                    </span>
                  )}
                  {active && <span className="shrink-0 text-emerald-400 font-bold">✓</span>}
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </details>
  );
}
