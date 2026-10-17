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
 * انتخاب نرخ برای یک درس:
 *   ۱) نوع درس مالیِ خودِ درس (دقیق — همان کاری که سما می‌کرد)
 *   ۲) نوع «تخصصی» (۳) — رایج‌ترین نوع در تعرفه
 *   ۳) گران‌ترین نوع موجود (آخرین چاره، تا درس بی‌نرخ نماند)
 */
export function pickTariffRate(
  rates: Map<number, TariffRate>,
  maliType: number | null | undefined,
): TariffRate | null {
  if (!rates || !rates.size) return null;
  if (maliType != null) {
    const exact = rates.get(Number(maliType));
    if (exact) return exact;
  }
  const common = rates.get(3);
  if (common) return common;
  let best: TariffRate | null = null;
  for (const r of rates.values()) {
    if (!best || n(r.th) + n(r.op) > n(best.th) + n(best.op)) best = r;
  }
  return best;
}
