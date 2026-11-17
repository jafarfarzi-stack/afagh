'use client';

/**
 * «حذف درس» — تنها راهِ حذفِ درسِ ثبت‌شده برای دانشجو.
 *
 * پیش‌تر `dropCourseAction` در سرور وجود داشت ولی هیچ دکمه‌ای آن را صدا
 * نمی‌زد (کامپوننت قدیمیِ `src/app/student/DropButton.tsx` در هیچ‌جا import
 * نشده بود)؛ دانشجو هیچ راهی برای حذف درس نداشت.
 *
 * نکات:
 *  • تأیید با همان دیالوگِ دسترس‌پذیرِ پروژه (`askConfirm` → `ConfirmProvider`)
 *    انجام می‌شود؛ مودالِ تازه ساخته نشده.
 *  • خطای سرور — به‌ویژه «مهلت حذف و اضافه بسته است» که گیتِ سروری
 *    (`assertEnrollmentWrite`) برمی‌گرداند — عیناً هم در توستِ خطا و هم
 *    به‌صورت متنِ پایدار زیرِ همان دکمه نمایش داده می‌شود؛ هرگز بی‌صدا رد
 *    نمی‌شود.
 *  • حلقهٔ فوکوس از قاعدهٔ سراسریِ `:focus-visible` می‌آید (globals.css)؛
 *    عمداً outline سفارشی اضافه نشده.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { askConfirm, notify } from '@/lib/ui-feedback';
import { dropCourseAction } from '../actions';

const CONFIRM_BODY =
  'این درس از کارنامهٔ نیمسال حذف می‌شود و شهریه/واحدهای آن آزاد می‌شود. ادامه می‌دهید؟';

const NOT_REGISTERED_HINT = 'حذف فقط برای دروسی ممکن است که وضعیت «ثبت‌شده» دارند (دروس ذخیره/در انتظار شورا/قطعی‌شده قابل حذف نیستند).';

const BTN_BASE =
  'inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border px-2.5 text-2xs font-extrabold transition-colors';

export default function DropCourseButton({
  enrollmentId,
  courseTitle,
  status,
}: {
  /** شناسهٔ ردیفِ ثبت‌نام (`enrollments.id`) — همان چیزی که `dropCourseAction` می‌گیرد. */
  enrollmentId: number;
  /** عنوان درس، برای aria-label و متنِ تأیید/موفقیت. */
  courseTitle: string;
  /** وضعیت ثبت‌نام؛ فقط `REGISTERED` قابل حذف است. */
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const canDrop = String(status ?? '').toUpperCase() === 'REGISTERED';

  if (!canDrop) {
    /* `<span title>` دورِ دکمهٔ disabled: بعضی مرورگرها tooltipِ خودِ عنصرِ
       disabled را نشان نمی‌دهند؛ متنِ دلیل هم در aria-label آمده است. */
    return (
      <span className="inline-flex max-w-full" title={NOT_REGISTERED_HINT}>
        <button
          type="button"
          disabled
          aria-label={`حذف درس ${courseTitle} — غیرفعال: ${NOT_REGISTERED_HINT}`}
          className={`${BTN_BASE} cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500`}
        >
          حذف درس
        </button>
      </span>
    );
  }

  async function handleDrop() {
    const ok = await askConfirm({
      title: `حذف درس «${courseTitle}»`,
      body: CONFIRM_BODY,
      confirmText: 'حذف درس',
      cancelText: 'انصراف',
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    setNote(null);
    try {
      const res = await dropCourseAction(enrollmentId);
      if (!res.ok) {
        /* متنِ فارسیِ سرور (مثلاً «مهلت حذف و اضافه … به پایان رسیده است»)
           عیناً منتقل می‌شود — نه پیامِ عمومیِ جانشین. */
        const msg = res.error || 'حذف درس انجام نشد؛ دوباره تلاش کنید.';
        setNote({ kind: 'error', text: msg });
        notify(msg, 'error');
        return;
      }

      const msg = res.promotedTo
        ? `درس «${courseTitle}» حذف شد ✓ (نفر بعدی لیست انتظار ارتقا یافت)`
        : `درس «${courseTitle}» حذف شد ✓`;
      setNote({ kind: 'success', text: msg });
      notify(msg, 'success');
      router.refresh();
    } catch {
      const msg = 'ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.';
      setNote({ kind: 'error', text: msg });
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDrop}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={`حذف درس ${courseTitle} از کارنامهٔ این نیمسال`}
        className={`${BTN_BASE} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-900/60`}
      >
        {busy ? 'در حال حذف…' : 'حذف درس'}
      </button>

      {note ? (
        <span
          role={note.kind === 'error' ? 'alert' : 'status'}
          className={`block max-w-[16rem] break-words text-3xs font-bold leading-5 ${
            note.kind === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {note.text}
        </span>
      ) : null}
    </span>
  );
}
