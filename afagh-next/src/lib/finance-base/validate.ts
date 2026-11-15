/**
 * اعتبارسنجیِ خالصِ «دادهٔ پایهٔ مالی» — بدون DB، بدون React.
 *
 * ورودی: مقادیرِ خامِ فرم (رشته/عدد/تهی) + توصیفِ موجودیت.
 * خروجی: یا مقادیرِ پاک‌شدهٔ آمادهٔ درج، یا فهرستِ خطاهای فارسی.
 *
 * ⚠ قواعدِ کلیدی:
 *   • مبلغ همیشه «عدد صحیح ریال» است (نه float) — هم‌راستا با safeRials.
 *   • رشتهٔ تهی ⇒ null (نه ''), مگر فیلد الزامی باشد.
 *   • فیلد الزامیِ خالی ⇒ خطا (نه درجِ بی‌صدا).
 *   • kind='select' فقط مقادیرِ مجاز را می‌پذیرد (جلوگیری از تزریقِ وضعیت).
 *   • تاریخ فقط YYYY-MM-DD.
 *   • هیچ کلیدِ ناشناخته‌ای از فرم پذیرفته نمی‌شود (whitelist).
 */
import { safeRials } from '@/lib/money';
import type { EntitySpec, FieldSpec } from './entities';

export type RawValues = Record<string, unknown>;

export interface ValidationOk {
  ok: true;
  values: Record<string, string | number | null>;
}
export interface ValidationFail {
  ok: false;
  errors: string[];
}
export type ValidationResult = ValidationOk | ValidationFail;

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** اعتبارسنجیِ یک فیلد — خروجی: {value} یا {error} */
export function validateField(f: FieldSpec, raw: unknown): { value?: string | number | null; error?: string } {
  if (isBlank(raw)) {
    if (f.required) return { error: `«${f.label}» الزامی است.` };
    // مقدار پیش‌فرض برای فیلدهای عددی/مبلغی که NOT NULL DEFAULT '0' دارند
    if (f.kind === 'money' || f.kind === 'number') return { value: 0 };
    if (f.kind === 'select' && f.options?.length) return { value: null };
    return { value: null };
  }

  switch (f.kind) {
    case 'text':
    case 'textarea': {
      const s = String(raw).trim();
      if (f.maxLength && s.length > f.maxLength) {
        return { error: `«${f.label}» بیش از ${f.maxLength} نویسه است.` };
      }
      return { value: s };
    }

    case 'money': {
      const n = safeRials(raw);
      if (n === null) return { error: `«${f.label}» باید عدد صحیح ریال (بدون اعشار) باشد.` };
      return { value: n };
    }

    case 'number': {
      const n = Number(String(raw).replace(/[,٬\s]/g, ''));
      if (!Number.isFinite(n)) return { error: `«${f.label}» عدد معتبر نیست.` };
      if (n < 0) return { error: `«${f.label}» نمی‌تواند منفی باشد.` };
      return { value: n };
    }

    case 'date': {
      const s = String(raw).trim();
      if (!DATE_RE.test(s)) return { error: `«${f.label}» باید تاریخِ YYYY-MM-DD باشد.` };
      const d = new Date(`${s}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return { error: `«${f.label}» تاریخِ معتبری نیست.` };
      return { value: s };
    }

    case 'select': {
      const s = String(raw).trim();
      if (!f.options?.some((o) => o.value === s)) {
        return { error: `مقدارِ «${f.label}» مجاز نیست.` };
      }
      return { value: s };
    }

    case 'ref': {
      const n = Number(raw);
      if (!Number.isSafeInteger(n) || n <= 0) return { error: `«${f.label}» انتخاب نشده است.` };
      return { value: n };
    }

    case 'term': {
      const n = Number(raw);
      if (!Number.isSafeInteger(n) || n <= 0) return { error: `«${f.label}» معتبر نیست.` };
      return { value: n };
    }

    case 'termCode': {
      const s = String(raw).trim();
      if (!/^\d{4,6}$/.test(s)) return { error: `«${f.label}» باید کدِ نیمسال (۴ تا ۶ رقم) باشد.` };
      return { value: s };
    }

    default:
      return { error: `نوعِ فیلدِ «${f.label}» پشتیبانی نمی‌شود.` };
  }
}

/**
 * اعتبارسنجیِ کلِ یک ردیف.
 * @param spec توصیفِ موجودیت
 * @param raw مقادیرِ فرم
 * @param partial اگر true، فقط کلیدهای موجود اعتبارسنجی می‌شوند (برای ویرایشِ جزئی)
 */
export function validateRow(spec: EntitySpec, raw: RawValues, partial = false): ValidationResult {
  const values: Record<string, string | number | null> = {};
  const errors: string[] = [];

  for (const f of spec.fields) {
    const present = Object.prototype.hasOwnProperty.call(raw, f.name);
    // در حالتِ جزئی، فیلدِ غایب دست نمی‌خورد (undefined) — نه null
    if (partial && !present) continue;

    const r = validateField(f, raw[f.name]);
    if (r.error) errors.push(r.error);
    else values[f.name] = r.value ?? null;
  }

  if (errors.length) return { ok: false, errors };
  if (partial && Object.keys(values).length === 0) {
    return { ok: false, errors: ['هیچ تغییری ارسال نشده است.'] };
  }
  return { ok: true, values };
}

/** مبالغ را برای نمایشِ فرم به رشته تبدیل می‌کند (بدون جداکننده تا ورودی ساده بماند) */
export function toFormValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}
