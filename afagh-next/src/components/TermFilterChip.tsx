'use client';

/**
 * نشان «فیلتر نیمسال فعال» + پاک‌کردن آن.
 * پاک‌کردن با POST به `/api/scope/term` انجام می‌شود (Route Handler کوکی را
 * پاک و به همین صفحه ریدایرکت می‌کند) — به‌جای Server Action + router.refresh
 * که می‌توانست صفحهٔ جاری را با کوکی جدید دوباره رندر کند.
 */
export default function TermFilterChip({
  title,
  universityId: _universityId,
}: {
  title: string;
  /** دیگر لازم نیست؛ دانشگاه از کوکی معتبر سرور خوانده می‌شود */
  universityId?: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs print:hidden">
      <span className="font-bold text-indigo-900">🗓 نیمسال: {title}</span>
      <span className="text-indigo-700/80">همهٔ نماهای این صفحه به همین نیمسال محدود شده‌اند.</span>
      <form action="/api/scope/term" method="post" className="mr-auto">
        <input type="hidden" name="termId" value="" />
        <button
          type="submit"
          className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 font-bold text-indigo-800 hover:bg-indigo-100"
        >
          پاک کردن فیلتر
        </button>
      </form>
    </div>
  );
}
