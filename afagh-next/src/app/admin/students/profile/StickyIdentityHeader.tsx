'use client';

// ═══════════════════════════════════════════════════════════════════════
// StickyIdentityHeader — سربرگ چسبانِ مشترک پروندهٔ دانشجو و استاد.
//
// پیش‌تر هر دو فرم یک «نوار هویت» جداگانه بالای فرم داشتند و کادر عکس
// دوباره پایین فرم تکرار می‌شد. اینجا یک نقطهٔ واحد:
// عکس + نام + کد + وضعیت + شماره‌های قبلی + ناوبری قبلی/بعدی + اکشن‌ها
// در حالت چسبان (sticky) تا هنگام اسکرول فرم، هویت رکورد و دکمهٔ
// ویرایش/ذخیره همیشه در دسترس باشد. در چاپ پنهان است.
// ═══════════════════════════════════════════════════════════════════════

import type { ReactNode } from 'react';
import PersonPhoto from '../components/PersonPhoto';
import type { PreviousStudentCode } from '../types';
import { faDigits } from '../transcript-utils';
import { studentStatusFa } from '@/lib/student-labels';

export default function StickyIdentityHeader({
 userId,
 hasPhoto,
 photoIcon = '👤',
 photoLabel = 'عکس پرسنلی',
 title,
 codeLabel,
 code,
 status,
 previousCodes = [],
 positionLabel,
 onPrev,
 onNext,
 canPrev,
 canNext,
 editing,
 canEdit,
 dirty,
 saving,
 onEdit,
 onSave,
 onCancel,
 extraActions,
}: {
 userId?: number | null;
 hasPhoto?: boolean | null;
 photoIcon?: string;
 photoLabel?: string;
 title: string;
 codeLabel: string;
 code: string;
 /** چیپ وضعیت (دانشجو: وضعیت تحصیلی / استاد: فعال-غیرفعال) */
 status?: ReactNode;
 previousCodes?: PreviousStudentCode[];
 positionLabel?: string;
 onPrev?: () => void;
 onNext?: () => void;
 canPrev?: boolean;
 canNext?: boolean;
 editing: boolean;
 canEdit: boolean;
 dirty?: boolean;
 saving?: boolean;
 onEdit?: () => void;
 onSave?: () => void;
 onCancel?: () => void;
 /** دکمه‌های اضافی (مثل «نقش‌ها» در پروندهٔ استاد) */
 extraActions?: ReactNode;
}) {
 return (
 <div className="sticky top-[6.5rem] lg:top-[4.25rem] z-30 bg-white/95 backdrop-blur border-b border-slate-200 dark:bg-slate-900/95 dark:border-slate-700 print:hidden">
 <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-slate-100/90 p-2 sm:p-3 rounded-t-lg dark:bg-slate-800/90">
 <PersonPhoto
 userId={userId}
 hasPhoto={hasPhoto}
 className="w-16 h-20"
 icon={photoIcon}
 label={photoLabel}
 />

 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
 <b className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{title || '—'}</b>
 <span className="text-2xs font-bold text-slate-500 dark:text-slate-400">{codeLabel}:</span>
 <span
 dir="ltr"
 className="rounded border border-slate-400 bg-yellow-200 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-slate-950 dark:border-amber-500/60 dark:bg-amber-300 dark:text-slate-950"
 >
 {faDigits(code || '—')}
 </span>
 {status}
 {editing && dirty && (
 <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-3xs font-bold text-amber-900">
 ● تغییرات ذخیره‌نشده
 </span>
 )}
 </div>

 {previousCodes.length > 0 && (
 <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-slate-600 dark:text-slate-300">
 <span className="font-bold text-slate-700 dark:text-slate-200">شمارهٔ قبلی:</span>
 {previousCodes.map(p => (
 <span key={`${p.code}-${p.entryYear}`} className="font-semibold">
 <b dir="ltr" className="font-mono">{faDigits(p.code)}</b>
 {' '}({p.major || '—'}، {faDigits(p.entryYear)}
 {p.status && p.status !== 'ACTIVE' ? ` — ${studentStatusFa(p.status)}` : ''})
 </span>
 ))}
 </div>
 )}
 </div>

 <div className="mr-auto flex flex-wrap items-center gap-1.5">
 {positionLabel && <span className="text-3xs font-bold text-slate-500 dark:text-slate-400">{positionLabel}</span>}
 {onPrev && (
 <button
 type="button"
 onClick={onPrev}
 disabled={!canPrev}
 className="rounded border border-slate-400 bg-white px-2 py-1 text-2xs font-bold hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
 title="پروندهٔ قبلی"
 >
 قبلی ▶
 </button>
 )}
 {onNext && (
 <button
 type="button"
 onClick={onNext}
 disabled={!canNext}
 className="rounded border border-slate-400 bg-white px-2 py-1 text-2xs font-bold hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
 title="پروندهٔ بعدی"
 >
 ◀ بعدی
 </button>
 )}

 {extraActions}

 {canEdit && (
 <div className="flex items-center gap-1.5">
 {!editing ? (
 <button
 type="button"
 onClick={onEdit}
 className="rounded bg-indigo-700 px-3 py-1.5 text-2xs font-bold text-white shadow-sm hover:bg-indigo-800"
 title="ویرایش پرونده"
 >
 ✏️ ویرایش
 </button>
 ) : (
 <>
 <button
 type="button"
 onClick={onSave}
 disabled={saving}
 className="rounded bg-emerald-700 px-3 py-1.5 text-2xs font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
 title="ذخیرهٔ تغییرات"
 >
 💾 {saving ? 'در حال ذخیره…' : 'ذخیره'}
 </button>
 <button
 type="button"
 onClick={onCancel}
 disabled={saving}
 className="rounded border border-slate-400 bg-white px-3 py-1.5 text-2xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
 title="انصراف و بازگشت به مقادیر ذخیره‌شده"
 >
 ↩ انصراف
 </button>
 </>
 )}
 </div>
 )}
 </div>
 </div>
 </div>
 );
}
