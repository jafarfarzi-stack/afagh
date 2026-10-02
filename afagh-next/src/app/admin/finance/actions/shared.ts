import { revalidatePath } from 'next/cache';
import { safeRials } from '@/lib/money';

export const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

export const clean = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' || s === 'null' || s === 'undefined' ? null : s;
};
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const intOrNull = (v: unknown): number | null => {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
/**
 * 🔒 پولِ صحیح (بازبینی — Medium): مبلغ همیشه «عدد صحیح ریال» اعتبارسنجی و ذخیره
 * می‌شود (safeRials) — نه float. ورودی نامعتبر → null → خطای صریح.
 */
export const money = (v: unknown): string => {
  const r = safeRials(v);
  if (r === null) throw new Error('مبلغ نامعتبر است (می‌بایست عدد صحیح ریال باشد).');
  return String(r);
};

export function revalidateStudent(studentId: number) {
  revalidatePath('/admin/finance');
  revalidatePath(`/admin/finance/student/${studentId}`);
}
