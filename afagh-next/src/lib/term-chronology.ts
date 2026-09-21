/**
 * ابزار تقدم و تأخر زمانی ترم‌ها (خالص، بدون وابستگی سروری)
 */

/**
 * تبدیل کد یا ترتیب ترم به یک مقدار عددی یکنواخت جهت سنجش تقدم و تأخر زمانی
 */
export function termChronologicalValue(termCode?: string | null, sortOrder?: number | null): number {
  if (sortOrder != null && sortOrder > 0) return sortOrder;
  if (!termCode) return 0;
  let code = termCode.trim();
  if (code.length === 3) {
    // e.g. 992 -> 13992
    code = '13' + code;
  } else if (code.length === 4 && (code.startsWith('4') || code.startsWith('0'))) {
    // e.g. 4001 -> 14001
    code = '1' + code;
  }
  const n = parseInt(code, 10);
  return Number.isFinite(n) ? n : 0;
}
