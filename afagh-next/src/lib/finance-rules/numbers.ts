/** تبدیل امن مقدار numeric/رشته/تهی به عدد */
export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** گرد کردن به ریال (بدون کسری) — همهٔ مبالغ سیستم ریالی‌اند */
export function toRial(value: number): number {
  return Math.round(value || 0);
}

/** تبدیل تاریخ (رشته/Date/تهی) به میلی‌ثانیهٔ epoch؛ تهی → null */
export function toMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}
