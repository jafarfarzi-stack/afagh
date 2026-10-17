/**
 * منطق خالصِ تعرفهٔ تفصیلی سما (بدون دیتابیس/Next) — قابل تست مستقیم با `npm test`.
 *
 * سما شهریهٔ هر درس را این‌گونه می‌ساخت:
 *     مبلغ درس = واحدهای نظری × Th(نوع درس مالی) + واحدهای عملی × OP(نوع درس مالی)
 */

export interface TariffRate {
  th: number;
  op: number;
}

export interface TariffLine {
  courseCode: string;
  courseTitle: string;
  units: number;
  theoryUnits: number;
  practicalUnits: number;
  maliType: number | null;
  /** نرخ مؤثر هر واحد (نمایشی) */
  perUnit: number;
  amount: number;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** مبلغ یک درس از تعرفه: نظری×Th + عملی×OP (ریال، صحیح) */
export function tariffCourseAmount(theoryUnits: unknown, practicalUnits: unknown, rate: TariffRate): number {
  return Math.round(n(theoryUnits) * n(rate?.th) + n(practicalUnits) * n(rate?.op));
}

/**
 * مبلغ درس با احتساب رفتار سند رسمی: درسی که نرخ ندارد (نوع درس مالی ندارد یا
 * نوعش در تعرفهٔ آن سال نیست) **صفر** حساب می‌شود، نه نرخ پیش‌فرض.
 */
export function tariffAmountOrZero(
  theoryUnits: unknown,
  practicalUnits: unknown,
  rate: TariffRate | null,
): number {
  if (!rate) return 0;
  return tariffCourseAmount(theoryUnits, practicalUnits, rate);
}

/**
 * انتخاب نرخ برای یک درس از تعرفهٔ همان سال.
 *
 * ⚠️ عمداً «پیش‌فرض» وجود ندارد: سامانهٔ سما درسی را که «نوع درس مالی» ندارد
 * (یا نوعش در تعرفهٔ آن سال نرخی ندارد) **صفر** حساب می‌کند؛ پس اگر نرخِ دقیق
 * پیدا نشود، null برمی‌گردد و مبلغ آن درس صفر می‌شود — همان رفتار سند رسمی.
 */
export function pickTariffRate(
  rates: Map<number, TariffRate>,
  maliType: number | null | undefined,
): TariffRate | null {
  if (!rates || !rates.size) return null;
  if (maliType == null) return null;
  const t = Number(maliType);
  if (!Number.isFinite(t) || t <= 0) return null;
  return rates.get(t) ?? null;
}
