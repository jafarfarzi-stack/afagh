/**
 * ════════════════════════════════════════════════════════════════════════
 *  تجزیهٔ «فهرستِ کد» (دانشجو / ترم) — منطقِ خالص، قابلِ تست
 * ════════════════════════════════════════════════════════════════════════
 *  فهرست از Excel/پیام می‌آید؛ جداکننده‌ها هر چیزی می‌توانند باشند:
 *  ویرگول فارسی/عربی، فاصله، Tab، خطِ جدید.
 *
 *  نکتهٔ مهم — طولِ کد دانشجویی **ثابت نیست**:
 *  در همین دیتابیس، طول‌ها از ۷ تا ۱۳ رقم دیده می‌شود (مثل 23921001،
 *  4021370010، 4000000000001) و حتی یک کدِ دارای خط‌تیره («9211311005-2»).
 *  پس تجزیه‌گر نباید ۱۰ رقمی فرض کند و نباید هر خط‌تیره را «بازه» بداند:
 *    • «4021370010-4021370015» → بازه (دو سرِ هم‌طول و ۴ رقم یا بیشتر)
 *    • «9211311005-2»          → یک کدِ کامل (سرِ دوم کوتاه است)
 *
 *  بازه با BigInt باز می‌شود تا حتی کدهای ۱۳–۲۰ رقمی هم بدون خطای
 *  دقتِ اعشاریِ Number درست باز شوند؛ عرضِ کد (صفرهای ابتدایی) حفظ می‌شود.
 * ════════════════════════════════════════════════════════════════════════
 */
import { toEnDigits } from './persian-search';

export type CodeListOptions = {
  /** کمینهٔ طولِ کد (دانشجو: ۴ · ترم: ۵) */
  minDigits?: number;
  /** بیشینهٔ طولِ کد — ستون students.studentCode در schema چهارده است،
   *  ولی برای آینده و کدهای موقت سخاوتمندانه‌تر می‌گیریم. */
  maxDigits?: number;
  /** سقفِ کدهای برگشتی */
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

/** سقفِ پیش‌فرض — یک گزارش با چند هزار کد هم با IN قابل اجراست. */
export const CODE_LIST_LIMIT = 2000;

/** کدِ کاملِ ممکن: فقط رقم، یا رقم با خط‌تیرهٔ داخلی (مثل 9211311005-2) */
const LITERAL_CODE = /^[0-9][0-9-]*[0-9]$/;

export function parseCodeList(raw: string | null | undefined, opts: CodeListOptions = {}): CodeListResult {
  const minLen = opts.minDigits ?? 4;
  const maxLen = opts.maxDigits ?? 20;
  const limit = opts.limit ?? CODE_LIST_LIMIT;
  const allowRanges = opts.allowRanges !== false;

  const digitCode = new RegExp(`^\\d{${minLen},${maxLen}}$`);
  // بازه: دو سرِ **هم‌طول** و هر دو در محدودهٔ طولِ مجاز
  const rangeToken = new RegExp(`^(\\d{${minLen},${maxLen}})[-–—](\\d{${minLen},${maxLen}})$`);

  const text = toEnDigits(String(raw ?? ''))
    .replace(/[؛;]/g, ',')
    .replace(/[،]/g, ',')
    // «تا/to» فقط وقتی بین دو رقم است جداکنندهٔ بازه است
    .replace(/(?<=\d)\s*(?:تا|to)\s*(?=\d)/gi, '-');

  const collected: string[] = [];
  const invalid: string[] = [];
  let usedRange = false;

  const expandRange = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    const from = BigInt(a);
    const to = BigInt(b);
    const diff = from > to ? from - to : to - from;
    if (diff > BigInt(limit)) return false;
    const lo = from < to ? from : to;
    for (let i = 0n; i <= diff; i += 1n) {
      collected.push((lo + i).toString().padStart(a.length, '0'));
    }
    return true;
  };

  for (const token of text.split(/[,\s]+/)) {
    if (!token) continue;

    if (digitCode.test(token)) {
      collected.push(token);
      continue;
    }

    if (allowRanges) {
      const m = rangeToken.exec(token);
      if (m && expandRange(m[1], m[2])) {
        usedRange = true;
        continue;
      }
      // «تا» فقط با فاصله معنا دارد؛ پیش‌تر به '-' تبدیل شده است
      if (m) {
        invalid.push(token);
        continue;
      }
    }

    // کدِ دارای خط‌تیرهٔ داخلی (نه بازه) — مثل 9211311005-2
    if (token.length >= minLen && LITERAL_CODE.test(token)) {
      collected.push(token);
      continue;
    }

    if (/\d/.test(token)) invalid.push(token);
    // واژه‌های بی‌عدد (مثل «کد») نادیده گرفته می‌شوند
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
