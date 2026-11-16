/**
 * ════════════════════════════════════════════════════════════════════════
 *  تجزیهٔ «فهرستِ کد» (دانشجو / ترم) — منطقِ خالص، قابلِ تست
 * ════════════════════════════════════════════════════════════════════════
 *  کاربر معمولاً فهرست را از Excel یا پیام می‌چسباند؛ جداکننده‌ها هر چیزی
 *  می‌توانند باشند: ویرگول فارسی/عربی، فاصله، Tab، خطِ جدید.
 *  بازه هم پشتیبانی می‌شود («4021370010-4021370015») چون کدهای دانشجویی
 *  رایج‌اند، ولی با سقفِ سخت تا یک اشتباهِ تایپی گزارش را قفل نکند.
 * ════════════════════════════════════════════════════════════════════════
 */
import { toEnDigits } from './persian-search';

export type CodeListOptions = {
  /** کمینهٔ طولِ کد (دانشجو: ۴ · ترم: ۴) */
  minDigits?: number;
  /** بیشینهٔ طولِ کد (دانشجو: ۱۴ · ترم: ۶) */
  maxDigits?: number;
  /** سقفِ کدهای برگشتی (پیش‌فرض ۵۰۰) */
  limit?: number;
  /** بازه را باز کند؟ (پیش‌فرض بله) */
  allowRanges?: boolean;
};

export type CodeListResult = {
  codes: string[];
  invalid: string[];
  usedRange: boolean;
  truncated: boolean;
};

export const CODE_LIST_LIMIT = 500;

export function parseCodeList(raw: string | null | undefined, opts: CodeListOptions = {}): CodeListResult {
  const minLen = opts.minDigits ?? 4;
  const maxLen = opts.maxDigits ?? 14;
  const limit = opts.limit ?? CODE_LIST_LIMIT;
  const allowRanges = opts.allowRanges !== false;

  const codeRe = new RegExp(`^\\d{${minLen},${maxLen}}$`);
  const text = toEnDigits(String(raw ?? ''))
    .replace(/[؛;]/g, ',')
    .replace(/[،]/g, ',');

  const collected: string[] = [];
  const invalid: string[] = [];
  let usedRange = false;

  const rest = allowRanges
    ? text.replace(
      new RegExp(`(\\d{${minLen},${maxLen}})\\s*(?:-|–|—|تا|to)\\s*(\\d{${minLen},${maxLen}})`, 'gi'),
      (_m, a: string, b: string) => {
        usedRange = true;
        if (a.length !== b.length) {
          invalid.push(`${a}-${b}`);
          return ' ';
        }
        const from = Number(a);
        const to = Number(b);
        if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || Math.abs(to - from) > limit) {
          invalid.push(`${a}-${b}`);
          return ' ';
        }
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        for (let n = lo; n <= hi; n += 1) {
          collected.push(String(n).padStart(a.length, '0'));
        }
        return ' ';
      },
    )
    : text;

  for (const token of rest.split(/[,\s]+/)) {
    if (!token) continue;
    if (codeRe.test(token)) collected.push(token);
    else if (/\d/.test(token)) invalid.push(token);
  }

  const unique = [...new Set(collected)].sort((a, b) => (a.length - b.length) || a.localeCompare(b));
  const codes = unique.slice(0, limit);
  return {
    codes,
    invalid: [...new Set(invalid)],
    usedRange,
    truncated: unique.length > codes.length,
  };
}
