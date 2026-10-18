/**
 * قالب‌بندی مشترک سلول‌های گزارش — یک نقطهٔ حقیقت برای مرکز گزارش‌ها.
 *
 * چرا ماژول جدا؟ هم کامپوننت کلاینت (نمایش جدول) و هم اکشن سرور (خروجی CSV) باید
 * یکسان قالب‌بندی کنند؛ این ماژول هیچ وابستگی سروری ندارد تا هر دو بتوانند
 * importش کنند.
 *
 * 🔒 نکتهٔ تاریخ: بخشی از ستون‌های تاریخ در این سامانه **از قبل شمسی**اند
 * (`exam_sessions.examDate`، `class_sessions.sessionDate` با سال ۱۳xx/۱۴xx) و
 * بخشی ISO/میلادی؛ پس هر دو پشتیبانی می‌شوند و هیچ تاریخ میلادی‌ای به کاربر
 * نمی‌رسد.
 */
import { toJalaliFromDate, faDigits } from '@/lib/calendar';

/** ارقام لاتین → فارسی (بدون تغییر مقدار) */
export const faNum = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '—' : String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** تاریخ/زمان شمسی از هر ورودی (شمسیِ آماده یا ISO/میلادی) */
export function jalaliSmart(value: unknown, withTime = false): string {
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value).trim();
  if (/^1[34]\d{2}[/\-]\d{1,2}[/\-]\d{1,2}/.test(raw)) return faDigits(raw.replace(/-/g, '/'));
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return faDigits(raw);
  const { jy, jm, jd } = toJalaliFromDate(d);
  const date = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
  if (!withTime) return faDigits(date);
  return faDigits(`${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}

export type ReportCellFormat = 'DATE' | 'DATETIME' | 'MONEY' | 'NUMBER' | undefined;

/** قالب‌بندی یک سلول گزارش بر پایهٔ `format` ستون */
export function formatReportCell(value: unknown, format?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (format) {
    case 'DATE': return jalaliSmart(value);
    case 'DATETIME': return jalaliSmart(value, true);
    case 'MONEY': return `${faNum(Math.round(Number(value) || 0).toLocaleString('en-US'))} ریال`;
    case 'NUMBER': return faNum(Number(value).toLocaleString('en-US'));
    default: return String(value);
  }
}
