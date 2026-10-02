import { toNum, toRial } from './numbers';

// ══════════════════════════════════════════════════════════════════════
//  تخفیف شهریه
// ══════════════════════════════════════════════════════════════════════

export type DiscountKind = 'PERCENT' | 'FIXED';
/** قلمرو اثر تخفیف: شهریهٔ ثابت، متغیر، یا هر دو */
export type DiscountScope = 'FIXED' | 'VARIABLE' | 'BOTH';

export interface DiscountLike {
  id: number;
  kind: DiscountKind | string;
  percent: number | string | null;
  amount: number | string | null;
  appliesTo: DiscountScope | string | null;
  /** سقف درصد مجاز از تعریف نوع تخفیف؛ null/تهی = بدون سقف */
  maxPercent?: number | string | null;
  /** عنوان نوع تخفیف — فقط برای نمایش در کارنامه */
  title?: string | null;
}

export interface AppliedAmount {
  id: number;
  title?: string | null;
  amount: number;
}

/** مأخذ محاسبهٔ یک تخفیف بر اساس قلمروی اثر آن */
export function discountBase(
  appliesTo: DiscountScope | string | null,
  fixedTuition: number,
  variableTuition: number
): number {
  if (appliesTo === 'FIXED') return toNum(fixedTuition);
  if (appliesTo === 'VARIABLE') return toNum(variableTuition);
  return toNum(fixedTuition) + toNum(variableTuition);
}

/** درصد مؤثر یک تخفیف با اعمال سقف مجاز نوع تخفیف */
export function effectivePercent(d: DiscountLike): number {
  const cap = d.maxPercent === null || d.maxPercent === undefined || d.maxPercent === ''
    ? 100
    : Math.max(0, toNum(d.maxPercent));
  const p = Math.max(0, toNum(d.percent));
  return Math.min(p, cap);
}

/** مبلغ یک تخفیف پیش از اعمال سقفِ «بیش از کل شهریه نشود» */
export function discountAmount(
  d: DiscountLike,
  fixedTuition: number,
  variableTuition: number
): number {
  if (d.kind === 'PERCENT') {
    const base = discountBase(d.appliesTo, fixedTuition, variableTuition);
    return toRial((base * effectivePercent(d)) / 100);
  }
  return toRial(Math.max(0, toNum(d.amount)));
}

export interface DiscountOutcome {
  total: number;
  net: number;
  applied: AppliedAmount[];
}

/**
 * اعمال زنجیرهٔ تخفیف‌ها.
 *
 * ترتیب ورودی مؤثر است: چون جمع تخفیف‌ها هرگز از کل شهریه بیشتر نمی‌شود،
 * تخفیفی که دیرتر برسد ممکن است صفر شود. فراخوان مسئول مرتب‌سازی است
 * (معمولاً درصد بالاتر زودتر، تا دانشجو بیشترین سود را ببرد).
 */
export function applyDiscounts(
  list: DiscountLike[],
  fixedTuition: number,
  variableTuition: number
): DiscountOutcome {
  const gross = toNum(fixedTuition) + toNum(variableTuition);
  let remaining = gross;
  const applied: AppliedAmount[] = [];

  for (const d of list || []) {
    let amount = discountAmount(d, fixedTuition, variableTuition);
    if (amount > remaining) amount = remaining;
    if (amount < 0) amount = 0;
    remaining -= amount;
    applied.push({ id: d.id, title: d.title ?? null, amount });
  }

  return { total: gross - remaining, net: remaining, applied };
}
