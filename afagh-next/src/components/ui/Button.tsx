import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * دکمهٔ مشترک — یک سیستم لمسی با عمقِ ملایم و حالت فشردهٔ واقعی.
 *
 * بدون `'use client'` تا در سرور کامپوننت‌ها و فرم‌های `action={serverAction}`
 * هم قابل استفاده باشد. توکن‌های `ui-t` و `shadow-e1/e2/key/pressed` در
 * tailwind.config تعریف شده‌اند.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'dangerGhost'
  | 'success'
  | 'link';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap border font-bold leading-none text-center ui-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none motion-reduce:enabled:active:translate-y-0 print:shadow-none print:transform-none';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-700 text-white border-indigo-800/70 shadow-key enabled:hover:bg-indigo-600 enabled:hover:shadow-e2 enabled:active:translate-y-px enabled:active:bg-indigo-800 enabled:active:shadow-none focus-visible:ring-indigo-500',
  secondary:
    'bg-white text-slate-700 border-slate-300 shadow-e1 enabled:hover:bg-slate-50 enabled:hover:border-slate-400 enabled:active:translate-y-px enabled:active:bg-slate-100 enabled:active:shadow-pressed focus-visible:ring-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600',
  ghost:
    'bg-transparent text-slate-600 border-transparent shadow-none enabled:hover:bg-slate-100 enabled:hover:text-slate-900 enabled:active:translate-y-px enabled:active:bg-slate-200/70 focus-visible:ring-slate-400 dark:text-slate-300 dark:enabled:hover:bg-slate-800',
  danger:
    'bg-rose-600 text-white border-rose-700/70 shadow-key enabled:hover:bg-rose-500 enabled:hover:shadow-e2 enabled:active:translate-y-px enabled:active:bg-rose-700 enabled:active:shadow-none focus-visible:ring-rose-500',
  dangerGhost:
    'bg-rose-50 text-rose-700 border-rose-200 enabled:hover:bg-rose-100 enabled:active:bg-rose-200/70 enabled:active:translate-y-px focus-visible:ring-rose-400 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800',
  success:
    'bg-emerald-700 text-white border-emerald-800/70 shadow-key enabled:hover:bg-emerald-600 enabled:hover:shadow-e2 enabled:active:translate-y-px enabled:active:bg-emerald-800 enabled:active:shadow-none focus-visible:ring-emerald-500',
  link: 'h-auto px-0 bg-transparent text-indigo-700 border-transparent shadow-none underline-offset-4 hover:underline',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-3xs rounded-lg [@media(pointer:coarse)]:h-10',
  md: 'h-9 px-3.5 text-xs rounded-[0.625rem] [@media(pointer:coarse)]:h-10',
  lg: 'h-11 px-5 text-sm rounded-xl',
  icon: 'h-10 w-10 p-0 rounded-[0.625rem]',
};

/** اندازهٔ متنِ لینک؛ بدون ارتفاع/پدینگِ جعبه تا `h-auto px-0` واقعاً اعمال شود. */
const LINK_SIZES: Record<Exclude<ButtonSize, 'icon'>, string> = {
  sm: 'text-3xs rounded-lg',
  md: 'text-xs rounded-[0.625rem]',
  lg: 'text-sm rounded-xl',
};

type SharedProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  loading?: boolean;
  full?: boolean;
  className?: string;
};

type IconA11y =
  | { label: string; 'aria-label'?: string }
  | { label?: string; 'aria-label': string };

export type ButtonProps =
  | (SharedProps & { size: 'icon' } & IconA11y)
  | (SharedProps & { size?: Exclude<ButtonSize, 'icon'> });

type InternalProps = SharedProps & {
  size?: ButtonSize;
  label?: string;
  'aria-label'?: string;
};

export default function Button(props: ButtonProps) {
  const {
    variant = 'secondary',
    size = 'md',
    icon,
    iconEnd,
    loading = false,
    full = false,
    className,
    children,
    type = 'button',
    disabled,
    label,
    'aria-label': ariaLabel,
    ...rest
  } = props as InternalProps;

  const isIcon = size === 'icon';
  const isLink = variant === 'link';
  const tooltip = label ?? ariaLabel;

  const classes = [
    BASE,
    VARIANTS[variant],
    isLink && size !== 'icon' ? LINK_SIZES[size] : SIZES[size],
    full && 'w-full',
    isIcon && 'group',
    loading && 'cursor-progress',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={isIcon ? (ariaLabel ?? label) : ariaLabel}
      className={classes}
    >
      {loading ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className="size-4 animate-spin motion-reduce:animate-none"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </span>
      ) : icon ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden>
          {icon}
        </span>
      ) : null}

      {children != null && children !== false ? <span className="min-w-0">{children}</span> : null}

      {loading ? <span className="sr-only">در حال انجام…</span> : null}

      {!loading && iconEnd ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden>
          {iconEnd}
        </span>
      ) : null}

      {isIcon && tooltip ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-3xs font-bold text-white opacity-0 shadow-e2 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-100 dark:text-slate-900 print:hidden"
        >
          {tooltip}
        </span>
      ) : null}
    </button>
  );
}
