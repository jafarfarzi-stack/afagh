import { toNum } from './numbers';
import { applyDiscounts, type AppliedAmount, type DiscountKind } from './discounts';
import { applySponsorships } from './sponsorships';

// ══════════════════════════════════════════════════════════════════════
//  تعدیلات ترم‌به‌ترم — تنها مرجع محاسبهٔ تخفیف و پوشش بنیاد
//
//  کارتابل و کارنامه هر دو از همین تابع عبور می‌کنند. اگر هر کدام منطق
//  خودشان را داشتند، عددِ یک دانشجو در دو صفحه فرق می‌کرد؛ این تابع
//  سازگاری را ساختاری تضمین می‌کند، نه با توافق دو پیاده‌سازی.
// ══════════════════════════════════════════════════════════════════════

export interface TermCharge {
  termId: number;
  /** مبلغ بدهی ثبت‌شده در دفتر مالی برای این ترم */
  charges: number;
}

export interface DiscountRowLike {
  id: number;
  /** تهی = روی همهٔ ترم‌های دانشجو اثر دارد */
  termId: number | null;
  kind: DiscountKind | string;
  percent: number | string | null;
  amount: number | string | null;
  title?: string | null;
}

export interface SponsorRowLike {
  id: number;
  termId: number | null;
  coverageKind: DiscountKind | string;
  percent: number | string | null;
  amount: number | string | null;
  title?: string | null;
}

export interface TermAdjustment {
  termId: number;
  charges: number;
  discounts: number;
  sponsorships: number;
  /** خالصِ پس از تخفیف و پوشش بنیاد — سهم دانشجو */
  studentShare: number;
  discountLines: AppliedAmount[];
  sponsorLines: AppliedAmount[];
}

/**
 * محاسبهٔ تخفیف و پوشش بنیاد به ازای هر ترم.
 *
 * ترتیب: تخفیف روی شهریهٔ ترم، سپس پوشش بنیاد روی خالصِ باقی‌مانده.
 * تخفیفِ بدون ترم روی تک‌تک ترم‌های دانشجو اثر می‌گذارد (نه یک بار)،
 * چون «همهٔ ترم‌ها» یعنی هر ترم سهم خودش را می‌گیرد.
 */
export function computeTermAdjustments(input: {
  termCharges: TermCharge[];
  discounts: DiscountRowLike[];
  sponsorships: SponsorRowLike[];
}): TermAdjustment[] {
  const out: TermAdjustment[] = [];

  for (const tc of input.termCharges || []) {
    const charges = Math.max(0, toNum(tc.charges));

    const activeDiscounts = (input.discounts || []).filter(
      (d) => d.termId === null || d.termId === undefined || d.termId === tc.termId
    );
    const disc = applyDiscounts(
      activeDiscounts.map((d) => ({
        id: d.id, kind: d.kind, percent: d.percent, amount: d.amount,
        appliesTo: 'BOTH' as const, title: d.title ?? null,
      })),
      charges, 0
    );

    const activeSponsors = (input.sponsorships || []).filter(
      (s) => s.termId === null || s.termId === undefined || s.termId === tc.termId
    );
    const spon = applySponsorships(
      activeSponsors.map((s) => ({
        id: s.id, coverageKind: s.coverageKind, percent: s.percent,
        amount: s.amount, title: s.title ?? null,
      })),
      disc.net
    );

    out.push({
      termId: tc.termId,
      charges,
      discounts: disc.total,
      sponsorships: spon.total,
      studentShare: spon.studentShare,
      discountLines: disc.applied.map((a) => ({ ...a })),
      sponsorLines: spon.applied.map((a) => ({ ...a })),
    });
  }

  return out;
}
