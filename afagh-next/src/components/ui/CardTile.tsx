import type { ReactNode } from 'react';
import Icon from '@/components/ui/Icon';

/**
 * کاشیِ گزارش — کارتِ قابل‌لمس برای فهرست گزارش‌ها.
 *
 * چرا: کارت‌های قبلی `<button>`های تخت با `transition-all` بودند؛ نه عمقِ
 * لایه‌ای داشتند، نه حالتِ فشرده، نه رنگِ متمایز برای هر دسته. این کامپوننت
 * کاملاً نمایشی است (بدون `'use client'`، بدون هوک) تا هیچ JS جدیدی به سمت
 * کلاینت اضافه نشود.
 */

/** همان ۱۱ کلیدِ ReportCat در ReportsClient */
export type ReportTone =
  | 'students'
  | 'probation'
  | 'program'
  | 'exams'
  | 'classes'
  | 'graduates'
  | 'council'
  | 'research'
  | 'finance'
  | 'finance-tuition'
  | 'finance-teaching'
  | 'finance-ops';

export const ACCENT: Record<ReportTone, { bar: string; tile: string; sel: string }> = {
  students: {
    bar: 'bg-sky-500',
    tile: 'from-sky-500/15 to-sky-500/0 text-sky-700 ring-sky-500/20',
    sel: 'border-sky-400 bg-sky-50 ring-sky-400/30',
  },
  probation: {
    bar: 'bg-amber-500',
    tile: 'from-amber-500/15 to-amber-500/0 text-amber-700 ring-amber-500/20',
    sel: 'border-amber-400 bg-amber-50 ring-amber-400/30',
  },
  program: {
    bar: 'bg-violet-500',
    tile: 'from-violet-500/15 to-violet-500/0 text-violet-700 ring-violet-500/20',
    sel: 'border-violet-400 bg-violet-50 ring-violet-400/30',
  },
  exams: {
    bar: 'bg-rose-500',
    tile: 'from-rose-500/15 to-rose-500/0 text-rose-700 ring-rose-500/20',
    sel: 'border-rose-400 bg-rose-50 ring-rose-400/30',
  },
  classes: {
    bar: 'bg-teal-500',
    tile: 'from-teal-500/15 to-teal-500/0 text-teal-700 ring-teal-500/20',
    sel: 'border-teal-400 bg-teal-50 ring-teal-400/30',
  },
  graduates: {
    bar: 'bg-emerald-500',
    tile: 'from-emerald-500/15 to-emerald-500/0 text-emerald-700 ring-emerald-500/20',
    sel: 'border-emerald-400 bg-emerald-50 ring-emerald-400/30',
  },
  council: {
    bar: 'bg-slate-500',
    tile: 'from-slate-500/15 to-slate-500/0 text-slate-700 ring-slate-500/20',
    sel: 'border-slate-400 bg-slate-50 ring-slate-400/30',
  },
  research: {
    bar: 'bg-indigo-500',
    tile: 'from-indigo-500/15 to-indigo-500/0 text-indigo-700 ring-indigo-500/20',
    sel: 'border-indigo-400 bg-indigo-50 ring-indigo-400/30',
  },
  finance: {
    bar: 'bg-cyan-500',
    tile: 'from-cyan-500/15 to-cyan-500/0 text-cyan-700 ring-cyan-500/20',
    sel: 'border-cyan-400 bg-cyan-50 ring-cyan-400/30',
  },
  'finance-tuition': {
    bar: 'bg-blue-500',
    tile: 'from-blue-500/15 to-blue-500/0 text-blue-700 ring-blue-500/20',
    sel: 'border-blue-400 bg-blue-50 ring-blue-400/30',
  },
  'finance-teaching': {
    bar: 'bg-violet-500',
    tile: 'from-violet-500/15 to-violet-500/0 text-violet-700 ring-violet-500/20',
    sel: 'border-violet-400 bg-violet-50 ring-violet-400/30',
  },
  'finance-ops': {
    bar: 'bg-fuchsia-500',
    tile: 'from-fuchsia-500/15 to-fuchsia-500/0 text-fuchsia-700 ring-fuchsia-500/20',
    sel: 'border-fuchsia-400 bg-fuchsia-50 ring-fuchsia-400/30',
  },
};

/**
 * پایهٔ همیشه‌حاضر — چیدمان، خط، فوکوس و چاپ.
 * `ui-t` گذارِ نرم است؛ عمداً `transition-all` نیست تا رنگ/سایه/جابه‌جایی
 * به‌اندازهٔ لازم نرم شوند و بقیهٔ ویژگی‌ها بی‌دلیل انیمیت نشوند.
 */
const BASE =
  'group relative flex w-full flex-col justify-between gap-2 overflow-hidden rounded-xl border border-slate-200/80 bg-white p-3 text-start ui-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 print:shadow-none print:transform-none';

/**
 * عمق و حرکت — فقط برای کارت‌های قابل‌اجرا.
 *
 * چرا جدا از BASE: `shadow-e1` و `ring` هر دو روی `box-shadow` می‌نشینند؛
 * اگر کارتِ «به‌زودی» `shadow-none` بگیرد ولی سایهٔ پایه هم رویش بماند،
 * ترتیبِ تولیدِ یوتیلیتی‌ها تعیین می‌کند کدام ببرد و فوکوس‌رینگ هم ممکن است
 * قربانی شود. با جداکردن، کارتِ غیرفعال سایه ندارد و حلقهٔ فوکوس سالم می‌ماند.
 */
const LIFT = 'shadow-e1 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-e2 active:translate-y-0 active:shadow-pressed';

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export default function CardTile({
  tone,
  size = 'standard',
  title,
  desc,
  icon,
  badge,
  selected,
  soon,
  onClick,
  className,
}: {
  tone: ReportTone;
  size?: 'feature' | 'standard';
  title: string;
  desc?: string;
  icon?: ReactNode;
  badge?: string;
  selected?: boolean;
  soon?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const accent = ACCENT[tone];
  const feature = size === 'feature';

  return (
    <button
      type="button"
      title={desc ? `${title} — ${desc}` : title}
      aria-pressed={selected ?? false}
      aria-disabled={soon ? true : undefined}
      data-selected={selected ? 'true' : undefined}
      data-soon={soon ? 'true' : undefined}
      /* کارتِ «به‌زودی» با کیبورد فوکوس‌پذیر می‌ماند ولی اجرا نمی‌کند */
      onClick={soon ? undefined : onClick}
      className={cn(
        BASE,
        feature ? 'min-h-[6.5rem]' : 'min-h-[5.75rem]',
        soon
          ? 'border-dashed border-slate-300 bg-slate-50/60 text-slate-600 shadow-none hover:translate-y-0 cursor-default'
          : cn(LIFT, selected && cn('ring-1', accent.sel)),
        className,
      )}
    >
      {/* نوارِ لهجهٔ دسته — «رنگِ هویت» کارت */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 start-0 w-1 transition-opacity motion-reduce:transition-none',
          accent.bar,
          feature ? 'opacity-70' : 'opacity-0 group-hover:opacity-100 group-data-[selected=true]:opacity-100',
        )}
      />

      <span className="flex items-start gap-2">
        {icon != null && (
          <span
            aria-hidden
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg leading-none ring-1 ring-inset shadow-[inset_0_1px_0_rgba(255,255,255,.6)]',
              accent.tile,
            )}
          >
            {typeof icon === 'string' ? <Icon emoji={icon} className="h-5 w-5" /> : icon}
          </span>
        )}
        <span className="line-clamp-2 min-h-[2.6em] min-w-0 text-[13px] font-extrabold leading-snug text-slate-800 group-data-[soon=true]:text-slate-500">
          {title}
        </span>
      </span>

      <span className="min-w-0">
        {desc && (
          <span className="line-clamp-2 min-h-[2.7em] text-2xs font-medium leading-[1.45] text-slate-600">
            {desc}
          </span>
        )}
        {badge && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-3xs font-bold text-slate-700 ring-1 ring-inset ring-slate-200/70">
            {badge}
          </span>
        )}
      </span>
    </button>
  );
}
