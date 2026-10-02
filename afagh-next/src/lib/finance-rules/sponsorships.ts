import { toNum, toRial } from './numbers';
import type { AppliedAmount, DiscountKind } from './discounts';

// ══════════════════════════════════════════════════════════════════════
//  پوشش بنیادها (کمیتهٔ امداد، بنیاد شهید، خیرین)
// ══════════════════════════════════════════════════════════════════════

export interface SponsorshipLike {
  id: number;
  coverageKind: DiscountKind | string;
  percent: number | string | null;
  amount: number | string | null;
  /** عنوان بنیاد — فقط برای نمایش */
  title?: string | null;
}

export interface SponsorshipOutcome {
  total: number;
  studentShare: number;
  applied: AppliedAmount[];
}

/**
 * پوشش بنیادها روی خالصِ پس از تخفیف اعمال می‌شود، نه روی ناخالص.
 *
 * دلیل: اگر بنیاد درصدی از ناخالص را بپردازد و دانشجو هم تخفیف گرفته باشد،
 * جمع دو مورد از شهریه فراتر می‌رود و دانشگاه بابت یک ترم دوبار پول می‌گیرد.
 */
export function applySponsorships(
  list: SponsorshipLike[],
  netTuition: number
): SponsorshipOutcome {
  const net = Math.max(0, toNum(netTuition));
  let remaining = net;
  const applied: AppliedAmount[] = [];

  for (const s of list || []) {
    let amount: number;
    if (s.coverageKind === 'PERCENT') {
      const p = Math.min(Math.max(0, toNum(s.percent)), 100);
      amount = toRial((net * p) / 100);
    } else {
      amount = toRial(Math.max(0, toNum(s.amount)));
    }
    if (amount > remaining) amount = remaining;
    if (amount < 0) amount = 0;
    remaining -= amount;
    applied.push({ id: s.id, title: s.title ?? null, amount });
  }

  return { total: net - remaining, studentShare: remaining, applied };
}
