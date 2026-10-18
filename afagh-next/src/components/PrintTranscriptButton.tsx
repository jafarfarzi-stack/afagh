'use client';

import { doPrintTranscript } from '@/components/print-transcript';

/**
 * دکمهٔ چاپ اسناد رسمی — همان منطق کارنامهٔ تحصیلی (کپی ایزوله + A4 + شماره صفحه).
 * برای کارنامهٔ مالی/تحصیلی و هر سندی که داخل `.transcript-print-area` است.
 */
export default function PrintTranscriptButton({
  orientation = 'landscape',
  label = 'چاپ / ذخیره PDF',
  className,
}: {
  orientation?: 'landscape' | 'portrait';
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => doPrintTranscript(orientation)}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-900 print:hidden'
      }
    >
      <span>🖨️</span>
      <span>{label}</span>
    </button>
  );
}
