'use client';

// ═══════════════════════════════════════════════════════════════════════
//  Field — بستهٔ کوچکِ «برچسب + مقدار/ورودی» برای فرم‌های پرونده.
//
//  چرا: فرم دانشجو و استاد پیش‌تر هر فیلد را با یک اسپن دستی + input بدون
//  `id`/`htmlFor` می‌ساختند؛ نتیجه اش این بود که کلیک روی برچسب فوکوس
//  نمی‌داد و فیلدهای مرده (بدون onChange) دقیقاً شبیه فیلدهای فعال دیده
//  می‌شدند. اینجا:
//    • `Field`      → برچسب (htmlFor) + کنترل + راهنما
//    • `TextField`  → ورودی متنی؛ اگر onChange داده نشود خودکار read-only است
//    • `SelectField`→ دراپ‌داون؛ در حالت مشاهده به مقدار متنی تبدیل می‌شود
//    • `ReadOnlyField` → مقدار فقط‌خواندنی (برای فیلدهایی که مسیر ذخیره ندارند)
// ═══════════════════════════════════════════════════════════════════════

import { useId } from 'react';
import type { ReactNode } from 'react';

const BASE = 'w-full rounded border px-2 py-1 text-xs transition-colors';
const EDIT = 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none';
const VIEW = 'bg-slate-100 border-slate-200 text-slate-700';
const VALUE = 'w-full rounded border px-2 py-1 text-xs bg-slate-100 border-slate-200 text-slate-800';

/** کلاس ورودی متنی — در حالت مشاهده ظاهر غیرفعال دارد تا با فیلد فعال اشتباه نشود */
export function inputClass(readOnly?: boolean): string {
  return `${BASE} ${readOnly ? VIEW : EDIT}`;
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
  className = '',
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-0.5 ${className}`}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block font-bold text-slate-700">
          {required && <span className="text-red-700">* </span>}
          {label}
        </label>
      ) : (
        <span className="block font-bold text-slate-700">
          {required && <span className="text-red-700">* </span>}
          {label}
        </span>
      )}
      {children}
      {hint && <p className="text-3xs leading-4 text-slate-500">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  required,
  hint,
  readOnly,
  disabled,
  dir,
  mono,
  center,
  placeholder,
  maxLength,
  type = 'text',
  inputMode,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  /** اگر داده نشود، فیلد فقط‌خواندنی رندر می‌شود (حالت مشاهده) */
  onChange?: (v: string) => void;
  required?: boolean;
  hint?: ReactNode;
  readOnly?: boolean;
  disabled?: boolean;
  dir?: 'ltr' | 'rtl';
  mono?: boolean;
  center?: boolean;
  placeholder?: string;
  maxLength?: number;
  type?: 'text' | 'number' | 'email' | 'tel';
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'decimal';
  className?: string;
}) {
  const id = useId();
  const ro = readOnly || !onChange;
  return (
    <Field label={label} htmlFor={id} required={required} hint={hint} className={className}>
      <input
        id={id}
        type={type}
        value={value ?? ''}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        readOnly={ro}
        disabled={disabled}
        dir={dir}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        className={`${inputClass(ro)} ${mono ? 'font-mono' : ''} ${center ? 'text-center' : ''} ${dir === 'ltr' ? 'text-left' : ''}`}
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  hint,
  readOnly,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  /** اگر داده نشود، مقدار متنی نمایش داده می‌شود (حالت مشاهده) */
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  hint?: ReactNode;
  readOnly?: boolean;
  className?: string;
}) {
  const id = useId();
  const ro = readOnly || !onChange;
  const text = options.find(o => o.value === String(value ?? ''))?.label ?? String(value ?? '');
  if (ro) {
    return (
      <Field label={label} required={required} hint={hint} className={className}>
        <div className={`${VALUE} font-semibold`}>{text || '—'}</div>
      </Field>
    );
  }
  return (
    <Field label={label} htmlFor={id} required={required} hint={hint} className={className}>
      <select
        id={id}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        className={`${BASE} ${EDIT} font-semibold`}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function ReadOnlyField({
  label,
  value,
  hint,
  mono,
  dir,
  align,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  mono?: boolean;
  dir?: 'ltr' | 'rtl';
  /** تراز مقدار؛ پیش‌فرض: در `dir=ltr` چپ‌چین */
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <div
        dir={dir}
        className={`${VALUE} ${mono ? 'font-mono' : ''} ${align === 'right' ? 'text-right' : align === 'left' || dir === 'ltr' ? 'text-left' : ''}`}
      >
        {value === '' || value === null || value === undefined ? '—' : value}
      </div>
    </Field>
  );
}
