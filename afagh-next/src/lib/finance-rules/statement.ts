import { toNum, toMs } from './numbers';
import type { AppliedAmount } from './discounts';

// ══════════════════════════════════════════════════════════════════════
//  کارنامهٔ مالی ترم‌به‌ترم
// ══════════════════════════════════════════════════════════════════════

export interface LedgerTxn {
  id: number;
  termId: number | null;
  transactionType: string | null;
  amount: number | string | null;
  description?: string | null;
  createdAt?: string | Date | null;
}

export interface ChequeRow {
  id: number;
  termId: number | null;
  chequeNo?: string | null;
  bankName?: string | null;
  amount: number | string | null;
  dueDate?: string | Date | null;
  status: string | null;
  remindedAt?: string | Date | null;
}

export interface LoanRow {
  id: number;
  termId: number | null;
  amount: number | string | null;
  lender?: string | null;
  status: string | null;
}

/** انواع تراکنش دفتر مالی که «بدهی» می‌سازند */
export const CHARGE_TYPES = ['CHARGE', 'TUITION_CHARGE'] as const;
/** انواع تراکنش دفتر مالی که «پرداخت» شمرده می‌شوند */
export const PAYMENT_TYPES = ['PAYMENT', 'CREDIT'] as const;
/** چک با این وضعیت پرداخت شمرده می‌شود */
export const CHEQUE_CLEARED = 'CLEARED';
/** وام با این وضعیت به مانده اثر می‌گذارد */
export const LOAN_ACTIVE = ['ACTIVE', 'SETTLED'] as const;

export function isChargeType(type: string | null): boolean {
  return CHARGE_TYPES.includes((type || '').toUpperCase() as (typeof CHARGE_TYPES)[number]);
}

export function isPaymentType(type: string | null): boolean {
  return PAYMENT_TYPES.includes((type || '').toUpperCase() as (typeof PAYMENT_TYPES)[number]);
}

/** رویداد کارنامهٔ مالی — «چه اتفاقی افتاده» */
export interface StatementEvent {
  kind: 'CHARGE' | 'DISCOUNT' | 'SPONSOR' | 'PAYMENT' | 'CHEQUE' | 'LOAN' | 'CLEARANCE';
  label: string;
  amount: number;
  dateMs: number | null;
  /** مثبت = به نفع دانشجو (کاهش بدهی)، منفی = به زیان او */
  sign: 1 | -1;
}

export interface TermStatement {
  termId: number;
  termTitle: string;
  charges: number;
  discounts: number;
  sponsorships: number;
  payments: number;
  chequesCleared: number;
  chequesPending: number;
  chequesBounced: number;
  loans: number;
  /** ناخالص − تخفیف − پوشش بنیاد */
  netPayable: number;
  /** مثبت = دانشجو بدهکار است */
  balance: number;
  events: StatementEvent[];
}

export interface TranscriptInput {
  ledger: LedgerTxn[];
  discounts?: AppliedAmount[];
  sponsorships?: AppliedAmount[];
  cheques?: ChequeRow[];
  loans?: LoanRow[];
  /** عنوان ترم‌ها برای نمایش؛ کلید = شناسهٔ ترم */
  termTitles?: Record<string, string>;
}

/**
 * ساخت کارنامهٔ مالی ترم‌به‌ترم از دفتر مالی و اقلام جانبی.
 *
 * تخفیف‌ها و پوشش بنیادها در ورودی «اعمال‌شده» دریافت می‌شوند چون محاسبهٔ
 * آن‌ها به شهریهٔ همان ترم نیاز دارد و در موتور شهریه انجام شده است.
 * تراکنش‌های بدون ترم (termId تهی) در سطر «بدون ترم» جمع می‌شوند تا هیچ
 * رویداد مالی گم نشود.
 */
export function buildTranscript(input: TranscriptInput): TermStatement[] {
  const termIds = new Set<number>();
  const NO_TERM = 0;

  for (const t of input.ledger || []) {
    termIds.add(t.termId === null || t.termId === undefined ? NO_TERM : t.termId);
  }
  for (const c of input.cheques || []) {
    termIds.add(c.termId === null || c.termId === undefined ? NO_TERM : c.termId);
  }
  for (const l of input.loans || []) {
    termIds.add(l.termId === null || l.termId === undefined ? NO_TERM : l.termId);
  }

  const titles = input.termTitles || {};
  const discountByTerm = input.discounts || [];
  const sponsorByTerm = input.sponsorships || [];

  const statements: TermStatement[] = [];

  for (const termId of Array.from(termIds).sort((a, b) => a - b)) {
    const inTerm = <T extends { termId: number | null }>(rows: T[]): T[] =>
      rows.filter((r) => (r.termId === null || r.termId === undefined ? NO_TERM : r.termId) === termId);

    const events: StatementEvent[] = [];
    let charges = 0;
    let payments = 0;

    for (const txn of inTerm(input.ledger || [])) {
      const amount = toNum(txn.amount);
      const dateMs = toMs(txn.createdAt);
      if (isChargeType(txn.transactionType)) {
        charges += amount;
        events.push({
          kind: 'CHARGE',
          label: txn.description || 'ثبت شهریه',
          amount,
          dateMs,
          sign: -1
        });
      } else if (isPaymentType(txn.transactionType)) {
        payments += amount;
        events.push({
          kind: 'PAYMENT',
          label: txn.description || 'پرداخت',
          amount,
          dateMs,
          sign: 1
        });
      }
    }

    let discounts = 0;
    for (const d of discountByTerm) {
      if ((d as { termId?: number | null }).termId !== undefined &&
          ((d as { termId?: number | null }).termId ?? NO_TERM) !== termId) continue;
      discounts += toNum(d.amount);
      events.push({
        kind: 'DISCOUNT',
        label: d.title || 'تخفیف شهریه',
        amount: toNum(d.amount),
        dateMs: null,
        sign: 1
      });
    }

    let sponsorships = 0;
    for (const s of sponsorByTerm) {
      if ((s as { termId?: number | null }).termId !== undefined &&
          ((s as { termId?: number | null }).termId ?? NO_TERM) !== termId) continue;
      sponsorships += toNum(s.amount);
      events.push({
        kind: 'SPONSOR',
        label: s.title || 'پوشش بنیاد',
        amount: toNum(s.amount),
        dateMs: null,
        sign: 1
      });
    }

    let chequesCleared = 0;
    let chequesPending = 0;
    let chequesBounced = 0;

    for (const c of inTerm(input.cheques || [])) {
      const amount = toNum(c.amount);
      const status = String(c.status || '').toUpperCase();
      const label = `چک ${c.chequeNo || ''}${c.bankName ? ` — ${c.bankName}` : ''}`.trim();
      const dateMs = toMs(c.dueDate);

      if (status === CHEQUE_CLEARED) {
        chequesCleared += amount;
        events.push({ kind: 'CHEQUE', label: `${label} (وصول شد)`, amount, dateMs, sign: 1 });
      } else if (status === 'BOUNCED') {
        chequesBounced += amount;
        events.push({ kind: 'CHEQUE', label: `${label} (برگشتی)`, amount, dateMs, sign: -1 });
      } else if (status === 'CANCELLED') {
        events.push({ kind: 'CHEQUE', label: `${label} (باطل‌شده)`, amount, dateMs, sign: 1 });
      } else {
        chequesPending += amount;
        events.push({ kind: 'CHEQUE', label: `${label} (در انتظار وصول)`, amount, dateMs, sign: 1 });
      }
    }

    let loans = 0;
    for (const l of inTerm(input.loans || [])) {
      const status = String(l.status || '').toUpperCase();
      if (!LOAN_ACTIVE.includes(status as (typeof LOAN_ACTIVE)[number])) continue;
      const amount = toNum(l.amount);
      loans += amount;
      events.push({
        kind: 'LOAN',
        label: l.lender ? `وام — ${l.lender}` : 'وام',
        amount,
        dateMs: toMs((l as { createdAt?: string | Date | null }).createdAt),
        sign: 1
      });
    }

    const netPayable = charges - discounts - sponsorships;
    const balance = netPayable - payments - chequesCleared - loans;

    events.sort((a, b) => {
      const am = a.dateMs ?? 0;
      const bm = b.dateMs ?? 0;
      if (am !== bm) return am - bm;
      return a.kind.localeCompare(b.kind);
    });

    statements.push({
      termId,
      termTitle: termId === NO_TERM ? 'بدون ترم' : titles[String(termId)] || `ترم ${termId}`,
      charges,
      discounts,
      sponsorships,
      payments,
      chequesCleared,
      chequesPending,
      chequesBounced,
      loans,
      netPayable,
      balance,
      events
    });
  }

  return statements;
}

/** جمع کل کارنامه — ماندهٔ نهایی دانشجو (مثبت = بدهکار) */
export function transcriptTotals(statements: TermStatement[]): {
  charges: number;
  discounts: number;
  sponsorships: number;
  payments: number;
  chequesCleared: number;
  chequesPending: number;
  chequesBounced: number;
  loans: number;
  balance: number;
} {
  const sum = (key: keyof TermStatement) =>
    (statements || []).reduce((acc, s) => acc + toNum(s[key]), 0);

  return {
    charges: sum('charges'),
    discounts: sum('discounts'),
    sponsorships: sum('sponsorships'),
    payments: sum('payments'),
    chequesCleared: sum('chequesCleared'),
    chequesPending: sum('chequesPending'),
    chequesBounced: sum('chequesBounced'),
    loans: sum('loans'),
    balance: sum('balance')
  };
}
