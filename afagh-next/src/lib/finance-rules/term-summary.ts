import { toNum } from './numbers';
import { DISCOUNT_BREAKDOWN_ORDER, type DiscountBreakdownItem } from './statement';

// ══════════════════════════════════════════════════════════════════════
//  ردیف‌های پایینِ هر نیمسال — تعریفِ واحدِ کانونی
//
//  چرا این ماژول؟
//  کارنامهٔ مالی دو چیدمان دارد:
//    ▸ نوع الف (FinancialTranscript.tsx)      — خلاصه به شکلِ شبکهٔ سه‌ستونه
//    ▸ نوع ب  (FinancialTranscriptFlat.tsx)   — خلاصه به شکلِ جدولِ تختِ ستونی
//  پیش‌تر هر کدام ردیف‌های خودش را دستی می‌ساخت و نتیجه این بود که یک سند
//  در دو چیدمان، ردیف‌های متفاوتی نشان می‌داد — کارشناس مالی نمی‌توانست
//  دو چاپ را با هم تطبیق بدهد و «یکسان‌سازی ردیف‌های پایینِ هر ترم»
//  (درخواست کاربر) عملاً ناممکن بود.
//
//  حالا **هر دو چیدمان از همین یک تعریف** تغذیه می‌شوند: ترتیبِ ردیف‌ها،
//  عنوان‌ها، شرطِ نمایش و رنگ‌ها یکی است. این ماژول هیچ importِ React ندارد
//  تا مستقیماً قابل آزمون باشد.
// ══════════════════════════════════════════════════════════════════════

/** یک ردیفِ خلاصهٔ ترم */
export interface TermSummaryRow {
  /** کلیدِ پایدار (برای تست و مقایسه) */
  key: string;
  /** عنوانِ ردیف */
  label: string;
  /** مبلغ (ریال) */
  value: number;
  /** کلاسِ رنگیِ مبلغ */
  cls?: string;
  /** ردیفِ پررنگ (قلم‌های جمع) */
  bold?: boolean;
  /** فقط وقتی مبلغش بزرگ‌تر از صفر است چاپ شود */
  onlyIfPositive?: boolean;
  /** فقط وقتی نامساوی صفر است چاپ شود (ماندهٔ قبلی — می‌تواند بستانکار باشد) */
  onlyIfNonZero?: boolean;
}

/** خلاصهٔ کاملِ یک ترم */
export interface TermSummary {
  /** ردیف‌های اصلی — به ترتیبِ کانونی */
  rows: TermSummaryRow[];
}

/** حداقلِ ساختاریِ ترم که این ماژول لازم دارد */
export interface TermSummaryInput {
  charges: number;
  tuitionFixed?: number;
  tuitionVariable?: number;
  discounts: number;
  discountBreakdown?: DiscountBreakdownItem[] | null;
  sponsorships: number;
  charityCoverage?: number;
  netPayable: number;
  payments: number;
  chequesCleared: number;
  chequesPending: number;
  chequesBounced: number;
  loans: number;
  balance: number;
}

/**
 * ساختِ ردیف‌های خلاصهٔ یک ترم — **تعریفِ واحد**.
 *
 * ترتیبِ ردیف‌ها قراردادی است و عیناً در هر دو چیدمان رعایت می‌شود:
 *   ۱) شهریه (بدهی)   ۲) شهریهٔ ثابت   ۳) شهریهٔ متغیر
 *   ۴) تخفیف (+ تفکیک) ۵) پوشش بنیاد   ۶) پوشش خیرین
 *   ۷) خالص            ۸) پرداخت        ۹) چک وصول‌شده
 *  ۱۰) چک در انتظار   ۱۱) چک برگشتی   ۱۲) مساعده (وام)
 *  ۱۳) ماندهٔ قبلی (انتقالی)            ۱۴) ماندهٔ ترم
 *
 * @param priorBalance ماندهٔ انتقالی از ترم‌های قبل (۰ = ندارد)
 */
export function buildTermSummary(
  t: TermSummaryInput,
  priorBalance: number = 0,
): TermSummary {
  const charity = toNum(t.charityCoverage);
  // پوششِ خیرین زیرمجموعهٔ `sponsorships` است و با برچسبِ مستقل چاپ می‌شود
  const sponsorOnly = Math.max(0, toNum(t.sponsorships) - charity);

  const rows: TermSummaryRow[] = [
    { key: 'charges', label: 'شهریه (بدهی)', value: toNum(t.charges) },
    {
      key: 'tuitionFixed',
      label: 'شهریهٔ ثابت',
      value: toNum(t.tuitionFixed),
      onlyIfPositive: true,
    },
    {
      key: 'tuitionVariable',
      label: 'شهریهٔ متغیر',
      value: toNum(t.tuitionVariable),
      onlyIfPositive: true,
    },
    { key: 'discounts', label: 'تخفیف', value: toNum(t.discounts), cls: 'text-violet-700' },
    { key: 'sponsor', label: 'پوشش بنیاد', value: sponsorOnly, cls: 'text-indigo-700' },
    {
      key: 'charity',
      label: 'پوشش خیرین',
      value: charity,
      cls: 'text-teal-700',
      onlyIfPositive: true,
    },
    { key: 'net', label: 'خالص', value: toNum(t.netPayable), bold: true },
    { key: 'payments', label: 'پرداخت', value: toNum(t.payments), cls: 'text-emerald-700' },
    {
      key: 'chequesCleared',
      label: 'چک وصول‌شده',
      value: toNum(t.chequesCleared),
      cls: 'text-emerald-700',
    },
    {
      key: 'chequesPending',
      label: 'چک در انتظار',
      value: toNum(t.chequesPending),
      cls: 'text-amber-700',
      onlyIfPositive: true,
    },
    {
      key: 'chequesBounced',
      label: 'چک برگشتی',
      value: toNum(t.chequesBounced),
      cls: 'text-rose-700',
      onlyIfPositive: true,
    },
    /* «مساعده» — همان برچسبی که کارنامهٔ قدیمِ سما می‌زد و کارشناس مالی
       با آن آشناست. پیش‌تر «وام» بود و کاربر آن را به‌عنوان ردیفِ گمشده
       گزارش کرد («تو کارنامه قدیم بندی هم به عنوان مساعده داشتیم»).
       منبعش تغییر نکرده: `loans` در موتور = واریزهای وام تحصیلی + جدول وام.
       ردیف عمداً همیشه چاپ می‌شود (حتی صفر)، مثل سند قدیم. */
    { key: 'loans', label: 'مساعده', value: toNum(t.loans), cls: 'text-sky-700' },
  ];

  // ماندهٔ قبلی (انتقالی) — فقط وقتی واقعاً چیزی منتقل شده
  if (priorBalance !== 0) {
    rows.push({
      key: 'prior',
      label: 'ماندهٔ قبلی (انتقالی)',
      value: priorBalance,
      onlyIfNonZero: true,
    });
  }

  // ماندهٔ ترم — همیشه چاپ می‌شود (قلمِ پایانیِ هر ترم)
  rows.push({ key: 'balance', label: 'ماندهٔ ترم', value: toNum(t.balance), bold: true });

  // تفکیکِ تخفیف — مثل جدولِ سما: **هر نوع، یک ردیفِ مستقل** (نه قلمِ جمعی،
  //   نه فرزندِ «└»، نه «تخفیف — X»). درخواستِ کاربر: «جدول‌هاش ثابته» —
  //   یعنی ترمِ تک‌تخفیفی و چندتخفیفی باید یک شکل باشند. وقتی هیچ قلمی
  //   نیست، ردیفِ جمعیِ «تخفیف» با مقدار صفر چاپ می‌شود.
  const raw = (t.discountBreakdown || []).filter((d) => d && toNum(d.amount) !== 0);
  // ترتیبِ کانونی (نه ترتیبِ درج در دفتر): دو چاپ و «جمع کل دوره» هم‌ترتیب
  // می‌شوند و کارشناس می‌تواند سطرها را با هم تطبیق بدهد.
  const orderOf = (k: string) => {
    const i = DISCOUNT_BREAKDOWN_ORDER.indexOf(k);
    return i === -1 ? DISCOUNT_BREAKDOWN_ORDER.length : i;
  };
  const sorted = [...raw].sort((a, b) => orderOf(a.key) - orderOf(b.key));

  if (sorted.length > 0) {
    const idx = rows.findIndex((r) => r.key === 'discounts');
    if (idx !== -1) {
      rows.splice(
        idx,
        1,
        ...sorted.map((d) => ({
          key: `discount:${d.key}`,
          label: String(d.label || 'تخفیف').trim(),
          value: toNum(d.amount),
          cls: 'text-violet-700',
        })),
      );
    }
  }

  return { rows };
}

/**
 * فیلترِ ردیف‌های قابلِ نمایش — شرطِ «فقط اگر مثبت/نامساوی صفر».
 *
 * جدا بودنش از ساختِ ردیف‌ها باعث می‌شود هر دو چیدمان دقیقاً یک فیلتر
 * داشته باشند (وگرنه یکی «چک در انتظار» را چاپ می‌کرد و دیگری نه).
 */
export function visibleSummaryRows(rows: TermSummaryRow[]): TermSummaryRow[] {
  return (rows || []).filter((r) => {
    if (r.onlyIfPositive && !(r.value > 0)) return false;
    if (r.onlyIfNonZero && r.value === 0) return false;
    return true;
  });
}
