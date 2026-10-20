// ════════════════════════════════════════════════════════════════════════
// تبدیل فایل‌های ثابت‌عرض سازمان سنجش (fixed-width) به رکوردها.
// ساختار ستون‌ها سال‌به‌سال تغییر می‌کند؛ بنابراین ساختار به‌صورت JSON
// قابل تنظیم است و از کاربر گرفته می‌شود.
// ════════════════════════════════════════════════════════════════════════

export interface SanjeshColumn {
  /** نام ستون (برای نمایش) */
  name: string;
  /** موقعیت شروع (0-based) */
  start: number;
  /** طول ستون */
  length: number;
  /** فیلد مقصد در سیستم (اختیاری) */
  target?: 'nationalCode' | 'studentCode' | 'previousMajorCode' | 'previousMajorTitle' | 'entryYear' | 'skip';
}

export interface ParsedSanjeshRow {
  [key: string]: string;
}

/** پارس یک خط fixed-width بر اساس ساختار ستون‌ها */
export function parseFixedWidthLine(line: string, columns: SanjeshColumn[]): ParsedSanjeshRow {
  const row: ParsedSanjeshRow = {};
  for (const col of columns) {
    const raw = line.slice(col.start, col.start + col.length);
    row[col.name] = raw.trim();
    if (col.target && col.target !== 'skip') {
      row[`__${col.target}`] = raw.trim();
    }
  }
  return row;
}

/** پارس کل متن فایل (هر خط یک رکورد) */
export function parseFixedWidthText(text: string, columns: SanjeshColumn[]): ParsedSanjeshRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows: ParsedSanjeshRow[] = [];
  for (const line of lines) {
    // رد کردن خطوط هدر/ جداکننده
    if (/^[-=]+$/.test(line.trim())) continue;
    rows.push(parseFixedWidthLine(line, columns));
  }
  return rows;
}

/** استخراج کد ملی نرمال‌شده (10 رقم) */
export function normalizeNationalCode(v: string | undefined): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return null;
}

/** پیشنهاد نسبت رشته (ساده: برابری کد = مرتبط) */
export function suggestRelation(prevCode: string | null, newMajorCode: string | null): 'RELATED' | 'PARTIAL' | 'UNRELATED' | null {
  if (!prevCode) return null;
  if (newMajorCode && prevCode === newMajorCode) return 'RELATED';
  // کدهای نزدیک (3 رقم اول یکسان) → نیمه‌مرتبط
  if (newMajorCode && prevCode.slice(0, 3) === newMajorCode.slice(0, 3)) return 'PARTIAL';
  return 'UNRELATED';
}
