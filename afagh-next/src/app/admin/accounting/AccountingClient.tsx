'use client';

/**
 * پنلِ «حسابداری و دفتر کل» — کدینگ، قواعدِ نگاشت، دوره‌ها، اسناد،
 * بازسازی و ماندهٔ افتتاحیه.
 *
 * همهٔ دادهٔ خواندنی از سرور به‌صورت prop می‌آید (بدون fetch کلاینتی) و هر
 * تغییر با Server Action + `router.refresh()` انجام می‌شود. هیچ دانشگاه/نقشی
 * از کلاینت به اکشن فرستاده نمی‌شود؛ اکشن خودش از `getCurrentUniversity`
 * و `requireRole` استفاده می‌کند.
 */

import { Fragment, useMemo, useState, useTransition, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import JalaliDateTimeInput from '@/components/JalaliDateTimeInput';
import { faNum, jalaliSmart } from '@/lib/report-format';
import { askConfirm, notify } from '@/lib/ui-feedback';
import {
  closePeriodAction,
  createAccountAction,
  postManualVoucherAction,
  postOpeningBalanceAction,
  reopenPeriodAction,
  reverseVoucherAction,
  runBackfillAction,
  savePostingRuleAction,
  setAccountFlagAction,
} from './actions';

// ══════════════════════════════════════════════════════════════════════
//  انواعِ مشترک با صفحهٔ سرور
// ══════════════════════════════════════════════════════════════════════

export type AccountRow = {
  id: number;
  code: string;
  name: string;
  type: string;
  normalSide: string;
  parentId: number | null;
  level: number;
  isActive: boolean;
  isPostable: boolean;
};

export type PeriodRow = {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
};

export type VoucherLineRow = {
  id: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string | null;
  studentLabel: string | null;
  termCode: string | null;
};

export type VoucherRow = {
  id: number;
  voucherNo: number;
  voucherDate: string;
  description: string | null;
  status: string;
  source: string;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
  lines: VoucherLineRow[];
};

export type PostingRuleRow = {
  eventKey: string;
  debitAccountCode: string;
  creditAccountCode: string;
  debitName: string | null;
  creditName: string | null;
  isActive: boolean;
};

export type ReconciliationRow = {
  ledgerRows: number;
  postedVouchers: number;
  unmatchedLedgerRows: number;
  unbalancedVouchers: number;
  closedPeriodViolations: number;
  duplicateSourceRefs: number;
};

export type TrialSummary = {
  periodTitle: string | null;
  from: string | null;
  to: string | null;
  debit: number;
  credit: number;
  accountCount: number;
  rows: { code: string; name: string; type: string; debit: number; credit: number; balance: number }[];
};

export type AccountingProps = {
  universityTitle: string;
  todayIso: string;
  canReopen: boolean;
  openingThisMonth: boolean;
  accounts: AccountRow[];
  periods: PeriodRow[];
  vouchers: VoucherRow[];
  rules: PostingRuleRow[];
  reconciliation: ReconciliationRow | null;
  trial: TrialSummary;
};

// ══════════════════════════════════════════════════════════════════════
//  واژگانِ فارسی
// ══════════════════════════════════════════════════════════════════════

const ACCOUNT_TYPE_FA: Record<string, string> = {
  ASSET: 'دارایی',
  LIABILITY: 'بدهی',
  EQUITY: 'سرمایه',
  REVENUE: 'درآمد',
  EXPENSE: 'هزینه',
};
const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

const SIDE_FA: Record<string, string> = { DEBIT: 'بدهکار', CREDIT: 'بستانکار' };

const VOUCHER_STATUS_FA: Record<string, string> = {
  POSTED: 'ثبت‌شده',
  REVERSED: 'برگشت‌خورده',
  DRAFT: 'پیش‌نویس',
};

const SOURCE_FA: Record<string, string> = {
  LEDGER: 'دفتر دانشجو',
  MANUAL: 'دستی',
  OPENING: 'افتتاحیه',
  PAYROLL: 'حقوق و دستمزد',
  EXPENSE: 'هزینه',
  CONTRACTOR: 'پیمانکار',
  BACKFILL: 'بازسازی',
};

const PERIOD_STATUS_FA: Record<string, string> = { OPEN: 'باز', CLOSED: 'بسته' };

/**
 * فهرستِ کانونیِ رویدادها — عیناً `student_ledger."transactionType"`.
 * ⚠ با `ck_student_ledger_txn_type` در schema و با فهرستِ actions.ts هم‌گام است.
 */
const EVENT_TYPES: { key: string; label: string }[] = [
  { key: 'TUITION_FIXED', label: 'شهریهٔ ثابت' },
  { key: 'TUITION_VARIABLE', label: 'شهریهٔ متغیر' },
  { key: 'TUITION_CHARGE', label: 'شهریه (موتور یکپارچه)' },
  { key: 'CHARGE', label: 'شارژ دستی' },
  { key: 'PAYMENT', label: 'پرداخت' },
  { key: 'POS_PAYMENT', label: 'پرداخت کارت‌خوان' },
  { key: 'POS_REFUND', label: 'برگشت کارت‌خوان' },
  { key: 'CREDIT', label: 'بستانکاری' },
  { key: 'LOAN', label: 'وام' },
  { key: 'SPONSORSHIP', label: 'پوشش بنیاد' },
  { key: 'DISCOUNT_FIXED', label: 'تخفیف شهریهٔ ثابت' },
  { key: 'DISCOUNT_VARIABLE', label: 'تخفیف شهریهٔ متغیر' },
  { key: 'SUBJECT_ADDITIVE', label: 'افزایش موضوعی' },
  { key: 'SUBJECT_DEDUCTIVE', label: 'کاهش موضوعی' },
  { key: 'TUITION_ADJUST_INC', label: 'تعدیل افزایشی شهریه' },
  { key: 'TUITION_ADJUST_DEC', label: 'تعدیل کاهشی شهریه' },
  { key: 'TUITION_BATES', label: 'تخفیف سما (بیتس)' },
  { key: 'TUITION_BATES_FIXED', label: 'تخفیف ثابت (سما)' },
  { key: 'TUITION_BATES_VARIABLE', label: 'تخفیف متغیر (سما)' },
  { key: 'TUITION_BATES_AMOUNT', label: 'تخفیف مبلغی (سما)' },
];

// ══════════════════════════════════════════════════════════════════════
//  کمکی‌ها
// ══════════════════════════════════════════════════════════════════════

/** «۱۲٬۳۴۵ ریال» — منفی با علامتِ پیش از عدد تا در RTL جابه‌جا نشود */
function money(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const r = Math.round(n);
  return `${r < 0 ? '−' : ''}${faNum(Math.abs(r).toLocaleString('en-US'))} ریال`;
}

/** ارقامِ فارسی/عربی → لاتین */
function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** ورودیِ مبلغ → عددِ صحیحِ نامنفی (برای جمعِ زندهٔ فرم) */
function parseAmount(value: string): number {
  const digits = toLatinDigits(value).replace(/[^\d]/g, '');
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/** «2025-11-01» → «۱۴۰۴/۰۸/۱۰» */
function dateFa(value: string | null | undefined): string {
  if (!value) return '—';
  return jalaliSmart(value);
}

let lineSeq = 0;
function newLine(): LineDraft {
  lineSeq += 1;
  return { key: `ln-${lineSeq}`, accountId: '', debit: '', credit: '' };
}

function Card({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
          {desc ? <p className="mt-1 text-2xs leading-5 text-slate-500">{desc}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ErrorBox({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-2xs font-bold text-rose-800">{text}</div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-2 py-6 text-center text-xs text-slate-500">
        {text}
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  ویرایشگرِ ردیف‌های سند (مشترک بین سندِ دستی و افتتاحیه)
// ══════════════════════════════════════════════════════════════════════

type LineDraft = { key: string; accountId: string; debit: string; credit: string };

function LinesEditor({
  lines,
  setLines,
  accounts,
  disabled,
}: {
  lines: LineDraft[];
  setLines: Dispatch<SetStateAction<LineDraft[]>>;
  accounts: AccountRow[];
  disabled?: boolean;
}) {
  const options = accounts.filter((a) => a.isActive && a.isPostable);
  const grouped = useMemo(() => {
    const map = new Map<string, AccountRow[]>();
    for (const t of ACCOUNT_TYPES) map.set(t, []);
    for (const a of options) {
      const bin = map.get(a.type) ?? map.get('ASSET')!;
      bin.push(a);
    }
    return [...map.entries()].filter(([, rows]) => rows.length > 0);
  }, [options]);

  const patch = (key: string, next: Partial<LineDraft>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  };

  return (
    <div className="space-y-2">
      {lines.map((line, index) => (
        <div
          key={line.key}
          className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_2.5rem]"
        >
          <label className="block">
            <span className="text-3xs font-bold text-slate-500">حساب ردیف {faNum(index + 1)}</span>
            <select
              className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white p-1.5 text-xs"
              value={line.accountId}
              disabled={disabled}
              onChange={(e) => patch(line.key, { accountId: e.target.value })}
            >
              <option value="">— انتخاب حساب —</option>
              {grouped.map(([type, rows]) => (
                <optgroup key={type} label={ACCOUNT_TYPE_FA[type] ?? type}>
                  {rows.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-3xs font-bold text-slate-500">بدهکار (ریال)</span>
            <input
              dir="ltr"
              inputMode="numeric"
              className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white p-1.5 text-center font-mono text-xs"
              value={line.debit}
              disabled={disabled}
              onChange={(e) => patch(line.key, { debit: e.target.value, credit: e.target.value ? '' : line.credit })}
            />
          </label>
          <label className="block">
            <span className="text-3xs font-bold text-slate-500">بستانکار (ریال)</span>
            <input
              dir="ltr"
              inputMode="numeric"
              className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white p-1.5 text-center font-mono text-xs"
              value={line.credit}
              disabled={disabled}
              onChange={(e) => patch(line.key, { credit: e.target.value, debit: e.target.value ? '' : line.debit })}
            />
          </label>
          <div className="flex items-end justify-end">
            <Button
              size="icon"
              variant="dangerGhost"
              label="حذف ردیف"
              disabled={disabled || lines.length <= 2}
              onClick={() => setLines((ls) => (ls.length <= 2 ? ls : ls.filter((l) => l.key !== line.key)))}
            >
              ✕
            </Button>
          </div>
        </div>
      ))}

      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setLines((ls) => [...ls, newLine()])}>
        ＋ افزودن ردیف
      </Button>
    </div>
  );
}

function LinesTotals({ lines }: { lines: LineDraft[] }) {
  let dr = 0;
  let cr = 0;
  for (const l of lines) {
    dr += parseAmount(l.debit);
    cr += parseAmount(l.credit);
  }
  const diff = dr - cr;
  return (
    <div className="flex flex-wrap items-center gap-2 text-2xs font-bold">
      <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">جمع بدهکار: {money(dr)}</span>
      <span className="rounded-lg bg-sky-50 px-2 py-1 text-sky-800">جمع بستانکار: {money(cr)}</span>
      {diff === 0 && dr > 0 ? (
        <span className="rounded-lg bg-emerald-700 px-2 py-1 text-white">تراز است ✓</span>
      ) : (
        <span className="rounded-lg bg-rose-50 px-2 py-1 text-rose-800">
          اختلاف: {money(Math.abs(diff))} {diff > 0 ? '(بدهکار بیشتر)' : diff < 0 ? '(بستانکار بیشتر)' : ''}
        </span>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  تبِ حساب‌ها
// ══════════════════════════════════════════════════════════════════════

function AccountsTab({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('ASSET');
  const [side, setSide] = useState<string>('DEBIT');
  const [parentId, setParentId] = useState('');
  const [isPostable, setIsPostable] = useState(true);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const visible = useMemo(() => {
    const q = toLatinDigits(query.trim()).toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter && a.type !== typeFilter) return false;
      if (!q) return true;
      return a.code.includes(q) || a.name.toLowerCase().includes(q);
    });
  }, [accounts, query, typeFilter]);

  const submit = () => {
    setError('');
    const cleanCode = toLatinDigits(code).replace(/[^\d]/g, '');
    if (!/^\d{1,20}$/.test(cleanCode)) {
      setError('کد حساب باید فقط رقم و بین ۱ تا ۲۰ رقم باشد.');
      return;
    }
    if (name.trim().length < 2) {
      setError('نام حساب باید دست‌کم ۲ نویسه باشد.');
      return;
    }
    start(async () => {
      const res = await createAccountAction({
        code: cleanCode,
        name,
        type,
        normalSide: side,
        parentId: parentId ? Number(parentId) : null,
        isPostable,
      });
      if (!res.ok) {
        setError(res.error || 'ثبتِ حساب ناموفق بود.');
        notify(res.error || 'ثبتِ حساب ناموفق بود.', 'error');
        return;
      }
      notify('حساب جدید به کدینگ افزوده شد.', 'success');
      setCode('');
      setName('');
      setParentId('');
      setIsPostable(true);
      router.refresh();
    });
  };

  const toggle = (row: AccountRow, field: 'isActive' | 'isPostable') => {
    setError('');
    const key = `${row.id}:${field}`;
    setBusy(key);
    const value = field === 'isActive' ? !row.isActive : !row.isPostable;
    start(async () => {
      const res = await setAccountFlagAction({ id: row.id, field, value });
      setBusy(null);
      if (!res.ok) {
        setError(res.error || 'تغییرِ وضعیت ناموفق بود.');
        notify(res.error || 'تغییرِ وضعیت ناموفق بود.', 'error');
        return;
      }
      notify(field === 'isActive' ? 'وضعیتِ فعال بودنِ حساب تغییر کرد.' : 'وضعیتِ قابل‌سند بودنِ حساب تغییر کرد.', 'success');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card
        title="افزودن حساب"
        desc="کد حساب در هر دانشگاه یکتاست. حسابِ تجمیعی (غیرقابلِ سند) را برای سرفصل‌ها بسازید و گردش را روی حساب‌های برگِ قابلِ سند بزنید."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">کد حساب</span>
            <input
              dir="ltr"
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-center font-mono text-sm"
              value={code}
              placeholder="مثلاً 1102"
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-2xs font-bold text-slate-600">نام حساب</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              value={name}
              placeholder="مثلاً حساب‌های دریافتنی دانشجویان — شعبهٔ مرکزی"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">نوع حساب</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setSide(['LIABILITY', 'EQUITY', 'REVENUE'].includes(e.target.value) ? 'CREDIT' : 'DEBIT');
              }}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_FA[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">طرفِ طبیعی</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
              value={side}
              onChange={(e) => setSide(e.target.value)}
            >
              <option value="DEBIT">بدهکار</option>
              <option value="CREDIT">بستانکار</option>
            </select>
          </label>
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">حساب والد (اختیاری)</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">— سطحِ اول —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={isPostable} onChange={(e) => setIsPostable(e.target.checked)} />
            <span className="text-2xs font-bold text-slate-700">قابلِ سندزنی باشد (حسابِ برگ)</span>
          </label>
          <div className="flex items-end">
            <Button variant="primary" loading={pending} onClick={submit}>
              افزودن حساب
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <ErrorBox text={error} />
        </div>
      </Card>

      <Card
        title={`کدینگ حساب‌ها (${faNum(accounts.length)})`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="w-40 rounded-lg border border-slate-300 p-1.5 text-xs"
              placeholder="جست‌وجوی کد/نام"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="rounded-lg border border-slate-300 bg-white p-1.5 text-xs"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">همهٔ انواع</option>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_FA[t]}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="rt-wrap">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">کد</th>
                <th className="px-2 py-2 text-right">نام</th>
                <th className="px-2 py-2 text-right">نوع</th>
                <th className="px-2 py-2 text-right">طرف</th>
                <th className="px-2 py-2 text-right">والد</th>
                <th className="px-2 py-2 text-center">قابلِ سند</th>
                <th className="px-2 py-2 text-center">فعال</th>
              </tr>
            </thead>
            <tbody>
              {!visible.length ? (
                <EmptyRow colSpan={7} text="حسابی با این فیلتر پیدا نشد." />
              ) : (
                visible.map((a) => {
                  const parent = a.parentId ? byId.get(a.parentId) : null;
                  return (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-mono">{faNum(a.code)}</td>
                      <td className="px-2 py-1.5 font-bold text-slate-800">
                        <span style={{ paddingInlineStart: `${Math.max(0, a.level - 1) * 10}px` }}>{a.name}</span>
                      </td>
                      <td className="px-2 py-1.5">{ACCOUNT_TYPE_FA[a.type] ?? a.type}</td>
                      <td className="px-2 py-1.5">{SIDE_FA[a.normalSide] ?? a.normalSide}</td>
                      <td className="px-2 py-1.5 text-slate-500">{parent ? `${faNum(parent.code)} — ${parent.name}` : '—'}</td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={pending && busy === `${a.id}:isPostable`}
                          onClick={() => toggle(a, 'isPostable')}
                          className={`rounded-md px-2 py-0.5 text-3xs font-bold ${
                            a.isPostable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {a.isPostable ? 'قابلِ سند' : 'تجمیعی'}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={pending && busy === `${a.id}:isActive`}
                          onClick={() => toggle(a, 'isActive')}
                          className={`rounded-md px-2 py-0.5 text-3xs font-bold ${
                            a.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {a.isActive ? 'فعال' : 'غیرفعال'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-3xs text-slate-500">
          حساب‌های پیش‌فرض در اولین بازدیدِ این صفحه ساخته می‌شوند؛ حذف نمی‌شوند تا سوابقِ اسناد پابرجا بماند — فقط
          می‌توانید غیرفعالشان کنید.
        </p>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  تبِ قواعدِ نگاشت
// ══════════════════════════════════════════════════════════════════════

type RuleEdit = { dr?: string; cr?: string; active?: boolean };

function RulesTab({ rules, accounts }: { rules: PostingRuleRow[]; accounts: AccountRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<string, RuleEdit>>({});

  const ruleByKey = useMemo(() => new Map(rules.map((r) => [r.eventKey, r])), [rules]);
  const options = useMemo(() => accounts.filter((a) => a.isActive && a.isPostable), [accounts]);

  const valueOf = (key: string) => {
    const base = ruleByKey.get(key);
    const edit = edits[key] ?? {};
    return {
      dr: edit.dr ?? base?.debitAccountCode ?? '',
      cr: edit.cr ?? base?.creditAccountCode ?? '',
      active: edit.active ?? base?.isActive ?? true,
      dirty: Object.keys(edit).length > 0,
      exists: Boolean(base),
    };
  };

  const setEdit = (key: string, patch: RuleEdit) => {
    setEdits((all) => ({ ...all, [key]: { ...(all[key] ?? {}), ...patch } }));
  };

  const save = (key: string) => {
    setError('');
    const v = valueOf(key);
    if (!v.dr || !v.cr) {
      setError('برای هر قاعده، حساب بدهکار و بستانکار را انتخاب کنید.');
      return;
    }
    setSavingKey(key);
    start(async () => {
      const res = await savePostingRuleAction({
        eventKey: key,
        debitAccountCode: v.dr,
        creditAccountCode: v.cr,
        isActive: v.active,
      });
      setSavingKey(null);
      if (!res.ok) {
        setError(res.error || 'ذخیرهٔ قاعده ناموفق بود.');
        notify(res.error || 'ذخیرهٔ قاعده ناموفق بود.', 'error');
        return;
      }
      setEdits((all) => {
        const next = { ...all };
        delete next[key];
        return next;
      });
      notify('قاعدهٔ نگاشت ذخیره شد.', 'success');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card
        title="قواعدِ نگاشتِ رویداد به حساب"
        desc="کلیدِ هر قاعده، عیناً همان نوعِ تراکنشِ دفتر مالی دانشجوست. اگر قاعده‌ای خالی بماند، ثبتِ خودکارِ آن رویدادِ دفتری با خطای «قاعده یافت نشد» رد می‌شود."
      >
        <ErrorBox text={error} />
        <div className="rt-wrap mt-2">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">رویداد (کلید ثابت)</th>
                <th className="px-2 py-2 text-right">حساب بدهکار</th>
                <th className="px-2 py-2 text-right">حساب بستانکار</th>
                <th className="px-2 py-2 text-center">فعال</th>
                <th className="px-2 py-2 text-center">ذخیره</th>
              </tr>
            </thead>
            <tbody>
              {EVENT_TYPES.map((ev) => {
                const v = valueOf(ev.key);
                const base = ruleByKey.get(ev.key);
                const drDisplay = v.dr
                  ? (v.dr === base?.debitAccountCode ? base?.debitName : options.find((a) => a.code === v.dr)?.name) ??
                    'حساب خارج از فهرستِ فعال'
                  : '';
                const crDisplay = v.cr
                  ? (v.cr === base?.creditAccountCode ? base?.creditName : options.find((a) => a.code === v.cr)?.name) ??
                    'حساب خارج از فهرستِ فعال'
                  : '';
                return (
                  <tr key={ev.key} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      <div className="font-bold text-slate-800">{ev.label}</div>
                      <div dir="ltr" className="font-mono text-3xs text-slate-400">
                        {ev.key}
                      </div>
                      {!v.exists ? <span className="text-3xs font-bold text-amber-700">تعریف‌نشده</span> : null}
                      {v.dirty ? <span className="ms-1 text-3xs font-bold text-indigo-700">• تغییر ذخیره‌نشده</span> : null}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="w-full min-w-40 rounded-lg border border-slate-300 bg-white p-1 text-xs"
                        value={v.dr}
                        onChange={(e) => setEdit(ev.key, { dr: e.target.value })}
                      >
                        <option value="">— انتخاب —</option>
                        {options.map((a) => (
                          <option key={a.id} value={a.code}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                      {v.dr ? (
                        <span className="mt-0.5 block text-3xs text-slate-400">{drDisplay}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="w-full min-w-40 rounded-lg border border-slate-300 bg-white p-1 text-xs"
                        value={v.cr}
                        onChange={(e) => setEdit(ev.key, { cr: e.target.value })}
                      >
                        <option value="">— انتخاب —</option>
                        {options.map((a) => (
                          <option key={a.id} value={a.code}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                      {v.cr ? (
                        <span className="mt-0.5 block text-3xs text-slate-400">{crDisplay}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={v.active}
                        onChange={(e) => setEdit(ev.key, { active: e.target.checked })}
                        aria-label={`فعال بودن قاعدهٔ ${ev.label}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Button
                        size="sm"
                        variant="primary"
                        loading={pending && savingKey === ev.key}
                        onClick={() => save(ev.key)}
                      >
                        ذخیره
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  تبِ دوره‌ها
// ══════════════════════════════════════════════════════════════════════

function PeriodsTab({ periods, canReopen }: { periods: PeriodRow[]; canReopen: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [target, setTarget] = useState<{ period: PeriodRow; mode: 'close' | 'reopen' } | null>(null);
  const [reason, setReason] = useState('');

  const closeModal = () => {
    if (pending) return;
    setTarget(null);
    setReason('');
  };

  const submit = () => {
    if (!target) return;
    setError('');
    if (reason.trim().length < 5) {
      setError('دلیل اجباری است (دست‌کم ۵ نویسه).');
      return;
    }
    const periodId = target.period.id;
    const mode = target.mode;
    start(async () => {
      const res =
        mode === 'close'
          ? await closePeriodAction({ periodId, reason })
          : await reopenPeriodAction({ periodId, reason });
      if (!res.ok) {
        setError(res.error || 'عملیات ناموفق بود.');
        notify(res.error || 'عملیات ناموفق بود.', 'error');
        return;
      }
      notify(mode === 'close' ? 'دوره بسته شد.' : 'دوره بازگشایی شد.', 'success');
      setTarget(null);
      setReason('');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card
        title={`دوره‌های مالی (${faNum(periods.length)})`}
        desc="دوره‌ها ماهانه و میلادی‌اند (عنوان YYYY-MM) و با اولین سندِ هر ماه خودکار ساخته می‌شوند. بستنِ دوره ثبتِ سندِ جدید در آن ماه را متوقف می‌کند."
      >
        <ErrorBox text={error} />
        <div className="rt-wrap mt-2">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">عنوان دوره</th>
                <th className="px-2 py-2 text-right">شروع</th>
                <th className="px-2 py-2 text-right">پایان</th>
                <th className="px-2 py-2 text-center">وضعیت</th>
                <th className="px-2 py-2 text-right">بسته‌شده در</th>
                <th className="px-2 py-2 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {!periods.length ? (
                <EmptyRow colSpan={6} text="هنوز دوره‌ای ساخته نشده است؛ اولین سند آن را می‌سازد." />
              ) : (
                periods.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-mono font-bold">{faNum(p.title)}</td>
                    <td className="px-2 py-1.5">{dateFa(p.startDate)}</td>
                    <td className="px-2 py-1.5">{dateFa(p.endDate)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className={`rounded-md px-2 py-0.5 text-3xs font-bold ${
                          p.status === 'OPEN' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {PERIOD_STATUS_FA[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">{p.closedAt ? dateFa(p.closedAt) : '—'}</td>
                    <td className="px-2 py-1.5 text-center">
                      {p.status === 'OPEN' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setError('');
                            setReason('');
                            setTarget({ period: p, mode: 'close' });
                          }}
                        >
                          بستن دوره
                        </Button>
                      ) : canReopen ? (
                        <Button
                          size="sm"
                          variant="dangerGhost"
                          onClick={() => {
                            setError('');
                            setReason('');
                            setTarget({ period: p, mode: 'reopen' });
                          }}
                        >
                          بازگشایی
                        </Button>
                      ) : (
                        <span className="text-3xs text-slate-400">فقط مدیر سامانه</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={Boolean(target)}
        onClose={closeModal}
        title={target?.mode === 'close' ? 'بستنِ دورهٔ مالی' : 'بازگشاییِ دورهٔ مالی'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" full onClick={closeModal} disabled={pending}>
              انصراف
            </Button>
            <Button
              variant={target?.mode === 'close' ? 'danger' : 'success'}
              full
              loading={pending}
              onClick={submit}
            >
              {target?.mode === 'close' ? 'تأییدِ بستن' : 'تأییدِ بازگشایی'}
            </Button>
          </>
        }
      >
        <p className="text-xs font-bold text-slate-700">
          دورهٔ <span className="font-mono">{faNum(target?.period.title ?? '')}</span>{' '}
          {target?.mode === 'close' ? 'بسته شود؟' : 'دوباره باز شود؟'} این تصمیم در گزارشِ حسابرسی ثبت می‌شود.
        </p>
        <label className="mt-3 block">
          <span className="text-2xs font-bold text-slate-600">دلیل (اجباری)</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثلاً: پایان بستنِ حساب‌های ماه و تأییدِ تراز آزمایشی"
          />
        </label>
        <div className="mt-2">
          <ErrorBox text={error} />
        </div>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  تبِ اسناد
// ══════════════════════════════════════════════════════════════════════

function VouchersTab({
  vouchers,
  accounts,
  todayIso,
}: {
  vouchers: VoucherRow[];
  accounts: AccountRow[];
  todayIso: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reverseFor, setReverseFor] = useState<VoucherRow | null>(null);
  const [reason, setReason] = useState('');

  const [date, setDate] = useState(todayIso);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine(), newLine()]);

  const resetForm = () => {
    setDate(todayIso);
    setDescription('');
    setLines([newLine(), newLine()]);
  };

  const submitManual = () => {
    setError('');
    if (!date) {
      setError('تاریخِ سند را وارد کنید.');
      return;
    }
    if (description.trim().length < 3) {
      setError('شرحِ سند اجباری است (دست‌کم ۳ نویسه).');
      return;
    }
    const payload = lines.map((l) => ({
      accountId: l.accountId ? Number(l.accountId) : null,
      debit: l.debit,
      credit: l.credit,
    }));
    start(async () => {
      const res = await postManualVoucherAction({ date: date.slice(0, 10), description, lines: payload });
      if (!res.ok) {
        setError(res.error || 'ثبتِ سند ناموفق بود.');
        notify(res.error || 'ثبتِ سند ناموفق بود.', 'error');
        return;
      }
      notify(`سند دستی شمارهٔ ${faNum(res.voucherNo ?? 0)} ثبت شد.`, 'success');
      resetForm();
      router.refresh();
    });
  };

  const submitReverse = () => {
    if (!reverseFor) return;
    setError('');
    if (reason.trim().length < 5) {
      setError('دلیلِ برگشت اجباری است (دست‌کم ۵ نویسه).');
      return;
    }
    const voucherId = reverseFor.id;
    start(async () => {
      const res = await reverseVoucherAction({ voucherId, reason });
      if (!res.ok) {
        setError(res.error || 'برگشتِ سند ناموفق بود.');
        notify(res.error || 'برگشتِ سند ناموفق بود.', 'error');
        return;
      }
      notify(`سند برگشتی شمارهٔ ${faNum(res.voucherNo ?? 0)} ثبت شد.`, 'success');
      setReverseFor(null);
      setReason('');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card
        title="سند دستی"
        desc="سند باید دست‌کم دو ردیف و تراز باشد؛ هر ردیف دقیقاً یک طرف (بدهکار یا بستانکار). کلیدِ یکتای سند به‌صورت MANUAL:<زمان> ساخته می‌شود."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">تاریخِ سند (شمسی)</span>
            <JalaliDateTimeInput value={date} onChange={setDate} withTime={false} />
          </label>
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">شرحِ سند</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثلاً: ثبتِ هزینهٔ تعمیرات ساختمان"
            />
          </label>
        </div>

        <div className="mt-3">
          <LinesEditor lines={lines} setLines={setLines} accounts={accounts} disabled={pending} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <LinesTotals lines={lines} />
          <Button variant="primary" loading={pending} onClick={submitManual}>
            ثبتِ سند دستی
          </Button>
        </div>
        <div className="mt-2">
          <ErrorBox text={error} />
        </div>
      </Card>

      <Card title={`آخرین اسناد (${faNum(vouchers.length)})`} desc="۱۰۰ سندِ آخر به ترتیبِ تاریخِ سند.">
        <div className="rt-wrap">
          <table className="rt w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-2 text-right">شماره</th>
                <th className="px-2 py-2 text-right">تاریخ</th>
                <th className="px-2 py-2 text-right">شرح</th>
                <th className="px-2 py-2 text-right">منبع</th>
                <th className="px-2 py-2 text-right">بدهکار</th>
                <th className="px-2 py-2 text-right">بستانکار</th>
                <th className="px-2 py-2 text-center">وضعیت</th>
                <th className="px-2 py-2 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {!vouchers.length ? (
                <EmptyRow colSpan={8} text="هنوز سندی ثبت نشده است." />
              ) : (
                vouchers.map((v) => {
                  const open = expanded === v.id;
                  return (
                    <Fragment key={v.id}>
                      <tr className="border-t border-slate-100">
                        <td className="px-2 py-1.5 font-mono font-bold">{faNum(v.voucherNo)}</td>
                        <td className="px-2 py-1.5">{dateFa(v.voucherDate)}</td>
                        <td className="px-2 py-1.5">
                          {v.description || '—'}
                          <span className="ms-1 text-3xs text-slate-400">({faNum(v.lineCount)} ردیف)</span>
                        </td>
                        <td className="px-2 py-1.5">{SOURCE_FA[v.source] ?? v.source}</td>
                        <td className="px-2 py-1.5 font-mono">{money(v.totalDebit)}</td>
                        <td className="px-2 py-1.5 font-mono">{money(v.totalCredit)}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span
                            className={`rounded-md px-2 py-0.5 text-3xs font-bold ${
                              v.status === 'POSTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : v.status === 'REVERSED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {VOUCHER_STATUS_FA[v.status] ?? v.status}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : v.id)}>
                              {open ? 'بستن' : 'جزئیات'}
                            </Button>
                            {v.status === 'POSTED' ? (
                              <Button
                                size="sm"
                                variant="dangerGhost"
                                onClick={() => {
                                  setError('');
                                  setReason('');
                                  setReverseFor(v);
                                }}
                              >
                                برگشت
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr key={`${v.id}-detail`} className="border-t border-slate-100 bg-slate-50/70">
                          <td colSpan={8} className="px-2 py-2">
                            {!v.lines.length ? (
                              <p className="text-2xs text-slate-500">ردیفی برای این سند ثبت نشده است.</p>
                            ) : (
                              <div className="space-y-1">
                                {v.lines.map((l) => (
                                  <div
                                    key={l.id}
                                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-white px-2 py-1 text-2xs"
                                  >
                                    <span className="font-bold text-slate-800">
                                      <span className="font-mono text-slate-500">{faNum(l.accountCode)}</span> — {l.accountName}
                                      {l.description ? <span className="ms-1 text-slate-400">({l.description})</span> : null}
                                    </span>
                                    <span className="flex flex-wrap items-center gap-2">
                                      {l.debit > 0 ? (
                                        <span className="font-mono text-rose-700">بدهکار {money(l.debit)}</span>
                                      ) : (
                                        <span className="font-mono text-emerald-700">بستانکار {money(l.credit)}</span>
                                      )}
                                      {l.studentLabel ? (
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                                          دانشجو: {l.studentLabel}
                                        </span>
                                      ) : null}
                                      {l.termCode ? (
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                                          ترم {faNum(l.termCode)}
                                        </span>
                                      ) : null}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={Boolean(reverseFor)}
        onClose={() => {
          if (pending) return;
          setReverseFor(null);
          setReason('');
        }}
        title="برگشتِ سند"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              full
              disabled={pending}
              onClick={() => {
                setReverseFor(null);
                setReason('');
              }}
            >
              انصراف
            </Button>
            <Button variant="danger" full loading={pending} onClick={submitReverse}>
              ثبتِ سندِ برگشتی
            </Button>
          </>
        }
      >
        <p className="text-xs font-bold text-slate-700">
          سند شمارهٔ <span className="font-mono">{faNum(reverseFor?.voucherNo ?? 0)}</span> با یک سندِ معکوس خنثی می‌شود
          (حذف نمی‌شود).
        </p>
        <label className="mt-3 block">
          <span className="text-2xs font-bold text-slate-600">دلیلِ برگشت (اجباری)</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثلاً: ثبتِ اشتباهِ حسابِ بدهکار"
          />
        </label>
        <div className="mt-2">
          <ErrorBox text={error} />
        </div>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  تبِ ماندهٔ افتتاحیه
// ══════════════════════════════════════════════════════════════════════

function OpeningTab({
  accounts,
  todayIso,
  hasOpening,
}: {
  accounts: AccountRow[];
  todayIso: string;
  hasOpening: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [date, setDate] = useState(todayIso);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine(), newLine()]);

  const submit = () => {
    setError('');
    if (!date) {
      setError('تاریخِ سند افتتاحیه را وارد کنید.');
      return;
    }
    const payload = lines.map((l) => ({
      accountId: l.accountId ? Number(l.accountId) : null,
      debit: l.debit,
      credit: l.credit,
    }));
    start(async () => {
      const res = await postOpeningBalanceAction({
        date: date.slice(0, 10),
        description,
        lines: payload,
      });
      if (!res.ok) {
        setError(res.error || 'ثبتِ ماندهٔ افتتاحیه ناموفق بود.');
        notify(res.error || 'ثبتِ ماندهٔ افتتاحیه ناموفق بود.', 'error');
        return;
      }
      notify(`سند افتتاحیه شمارهٔ ${faNum(res.voucherNo ?? 0)} ثبت شد.`, 'success');
      setDescription('');
      setLines([newLine(), newLine()]);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card
        title="ثبتِ ماندهٔ افتتاحیه"
        desc="این فرم یک سندِ OPENING در ماهِ انتخابی می‌سازد تا ترازنامه از یک ماندهٔ واقعی شروع شود. برای هر دوره فقط یک سندِ افتتاحیهٔ برگشت‌نخورده مجاز است."
      >
        {hasOpening ? (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-2xs font-bold text-amber-900">
            در دورهٔ جاری قبلاً سندِ افتتاحیه ثبت شده است. برای اصلاح، ابتدا همان سند را از تبِ «اسناد» برگشت بزنید.
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">تاریخِ افتتاحیه (شمسی)</span>
            <JalaliDateTimeInput value={date} onChange={setDate} withTime={false} />
          </label>
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">شرح (اختیاری)</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ماندهٔ افتتاحیه — ابتدای دوره"
            />
          </label>
        </div>

        <div className="mt-3">
          <LinesEditor lines={lines} setLines={setLines} accounts={accounts} disabled={pending} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <LinesTotals lines={lines} />
          <Button variant="primary" loading={pending} onClick={submit}>
            ثبتِ سند افتتاحیه
          </Button>
        </div>
        <div className="mt-2">
          <ErrorBox text={error} />
        </div>
        <p className="mt-2 text-3xs text-slate-500">
          مثال: صندوق/بانک (بدهکار) در برابر سرمایه و مانده انتظامی (بستانکار)؛ یا حساب‌های دریافتنی دانشجویان در برابر
          درآمدِ شهریهٔ معوق. سند باید تراز باشد.
        </p>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  تبِ بازسازی
// ══════════════════════════════════════════════════════════════════════

type BackfillResult = {
  scanned: number;
  posted: number;
  skipped: number;
  failed: number;
  unmatchedTypes: { transactionType: string; rows: number }[];
  samples: { ledgerId: number; error: string }[];
  durationMs: number;
};

function RebuildTab({
  reconciliation,
}: {
  reconciliation: ReconciliationRow | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [termCode, setTermCode] = useState('');
  const [maxRows, setMaxRows] = useState('2000');
  const [dryRunResult, setDryRunResult] = useState<BackfillResult | null>(null);
  const [realResult, setRealResult] = useState<BackfillResult | null>(null);
  const [recon, setRecon] = useState<ReconciliationRow | null>(null);
  const [dryRunDone, setDryRunDone] = useState(false);

  const day = (v: string) => (v ? v.slice(0, 10) : undefined);

  const run = async (nextDryRun: boolean) => {
    setError('');
    if (!nextDryRun) {
      const ok = await askConfirm({
        title: 'اجرای واقعیِ بازسازی',
        body:
          'این عملیات ردیف‌های واجدِ شرایطِ دفتر مالی دانشجو را به سندِ حسابداری تبدیل می‌کند. برای ردیف‌های تکراری چیزی دوباره ساخته نمی‌شود، ولی اجرای آن ممکن است چند دقیقه طول بکشد. ادامه می‌دهید؟',
        confirmText: 'اجرای واقعی',
        cancelText: 'انصراف',
        danger: true,
      });
      if (!ok) return;
    }
    start(async () => {
      const res = await runBackfillAction({
        dryRun: nextDryRun,
        confirm: nextDryRun ? undefined : true,
        fromVoucherDate: day(from) ?? undefined,
        toVoucherDate: day(to) ?? undefined,
        termCode: termCode.trim() || undefined,
        maxRows: parseAmount(maxRows) || 2000,
      });
      if (!res.ok) {
        setError(res.error || 'اجرای بازسازی ناموفق بود.');
        notify(res.error || 'اجرای بازسازی ناموفق بود.', 'error');
        return;
      }
      if (nextDryRun) {
        setDryRunResult(res.result);
        setRealResult(null);
        setDryRunDone(true);
        notify('اجرای آزمایشی تمام شد؛ خروجی را بررسی کنید.', 'info');
      } else {
        setRealResult(res.result);
        setDryRunDone(false);
        notify('بازسازی واقعی انجام شد.', 'success');
      }
      setRecon(res.reconciliation);
      router.refresh();
    });
  };

  const shown = realResult ?? dryRunResult;

  return (
    <div className="space-y-4">
      <Card
        title="بازسازیِ دفتر کل از دفتر دانشجو"
        desc="پیش‌فرض «آزمایشی» است و هیچ چیزی نمی‌نویسد. اجرای واقعی فقط بعد از دیدنِ خروجیِ آزمایشی و با تأییدِ صریح انجام می‌شود."
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-2xs font-bold leading-5 text-amber-900">
          ⏳ اجرای واقعی روی دفترهای بزرگ ممکن است چند دقیقه طول بکشد. صفحه را نبندید و از دکمه‌های دیگر استفاده نکنید
          تا نتیجه بیاید؛ پس از پایان، شمارنده‌های مغایرت به‌روز می‌شوند.
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">از تاریخ سند (شمسی، اختیاری)</span>
            <JalaliDateTimeInput value={from} onChange={setFrom} withTime={false} />
          </label>
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">تا تاریخ سند (شمسی، اختیاری)</span>
            <JalaliDateTimeInput value={to} onChange={setTo} withTime={false} />
          </label>
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">کد نیمسال (اختیاری)</span>
            <input
              dir="ltr"
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-center font-mono text-sm"
              value={termCode}
              onChange={(e) => setTermCode(e.target.value)}
              placeholder="14041"
            />
          </label>
          <label className="block">
            <span className="text-2xs font-bold text-slate-600">حداکثر ردیف</span>
            <input
              dir="ltr"
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-center font-mono text-sm"
              value={maxRows}
              onChange={(e) => setMaxRows(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" loading={pending} onClick={() => run(true)}>
            اجرای آزمایشی (بدون نوشتن)
          </Button>
          <Button variant="danger" loading={pending} disabled={!dryRunDone} onClick={() => run(false)}>
            اجرای واقعی (با تأیید)
          </Button>
          {!dryRunDone ? <span className="text-3xs text-slate-500">اجرای واقعی پس از یک اجرای آزمایشی فعال می‌شود.</span> : null}
        </div>
        <div className="mt-2">
          <ErrorBox text={error} />
        </div>
      </Card>

      {shown ? (
        <Card
          title={realResult ? 'نتیجهٔ اجرای واقعی' : 'نتیجهٔ اجرای آزمایشی'}
          desc={realResult ? 'این اجرا سندها را نوشته است.' : 'هیچ تغییری در دیتابیس نوشته نشده است.'}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="ردیف‌های بررسی‌شده" value={faNum(shown.scanned)} tone="slate" />
            <Stat label="سندِ ساخته‌شده" value={faNum(shown.posted)} tone="emerald" />
            <Stat label="رد شده (تکراری/بی‌ربط)" value={faNum(shown.skipped)} tone="slate" />
            <Stat label="خطا" value={faNum(shown.failed)} tone={shown.failed ? 'rose' : 'slate'} />
            <Stat label="مدت اجرا" value={`${faNum(Math.round(shown.durationMs / 1000))} ثانیه`} tone="slate" />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-2xs font-black text-slate-700">انواعِ بدونِ قاعدهٔ نگاشت</h3>
              {!shown.unmatchedTypes.length ? (
                <p className="text-2xs text-slate-500">همهٔ انواعِ رویداد قاعدهٔ نگاشت داشتند.</p>
              ) : (
                <ul className="space-y-1">
                  {shown.unmatchedTypes.map((u) => (
                    <li
                      key={u.transactionType}
                      className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-2xs"
                    >
                      <span dir="ltr" className="font-mono">
                        {u.transactionType}
                      </span>
                      <span className="font-bold text-amber-900">{faNum(u.rows)} ردیف</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-1 text-2xs font-black text-slate-700">نمونهٔ خطاها</h3>
              {!shown.samples.length ? (
                <p className="text-2xs text-slate-500">خطایی گزارش نشد.</p>
              ) : (
                <ul className="space-y-1">
                  {shown.samples.slice(0, 10).map((s) => (
                    <li key={s.ledgerId} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-2xs text-rose-800">
                      <span className="font-mono">#{faNum(s.ledgerId)}</span> — {s.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <ReconciliationCard reconciliation={recon ?? reconciliation} />
    </div>
  );
}

function ReconciliationCard({ reconciliation }: { reconciliation: ReconciliationRow | null }) {
  if (!reconciliation) {
    return (
      <Card title="مغایرت‌گیریِ دفتر کل">
        <p className="text-xs text-slate-500">عددِ مغایرت در دسترس نیست (خطا در خواندنِ گزارش).</p>
      </Card>
    );
  }
  const problem =
    reconciliation.unbalancedVouchers > 0 ||
    reconciliation.closedPeriodViolations > 0 ||
    reconciliation.duplicateSourceRefs > 0;
  return (
    <Card
      title="مغایرت‌گیریِ دفتر کل"
      desc="پس از هر بازسازی، این اعداد باید «صفر» باشند؛ هر عددِ ناصفر یعنی دفتر دانشجو و دفتر کل با هم نمی‌خوانند."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="ردیف‌های دفتر دانشجو" value={faNum(reconciliation.ledgerRows)} tone="slate" />
        <Stat label="اسنادِ ثبت‌شده" value={faNum(reconciliation.postedVouchers)} tone="slate" />
        <Stat
          label="ردیفِ بدونِ سند"
          value={faNum(reconciliation.unmatchedLedgerRows)}
          tone={reconciliation.unmatchedLedgerRows ? 'amber' : 'emerald'}
        />
        <Stat
          label="سندِ ناتراز"
          value={faNum(reconciliation.unbalancedVouchers)}
          tone={reconciliation.unbalancedVouchers ? 'rose' : 'emerald'}
        />
        <Stat
          label="سند در دورهٔ بسته"
          value={faNum(reconciliation.closedPeriodViolations)}
          tone={reconciliation.closedPeriodViolations ? 'rose' : 'emerald'}
        />
        <Stat
          label="مرجعِ تکراری"
          value={faNum(reconciliation.duplicateSourceRefs)}
          tone={reconciliation.duplicateSourceRefs ? 'rose' : 'emerald'}
        />
      </div>
      {problem ? (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-2xs font-bold text-rose-800">
          ⚠ مغایرت وجود دارد؛ پیش از بستنِ دوره یا ارائهٔ گزارش‌های رسمی آن را برطرف کنید.
        </p>
      ) : (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-2xs font-bold text-emerald-800">
          ✓ دفتر دانشجو و دفتر کل با هم می‌خوانند.
        </p>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'rose' | 'amber';
}) {
  const tones: Record<string, string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
  };
  return (
    <div className={`rounded-xl border p-2 ${tones[tone]}`}>
      <div className="text-3xs font-bold opacity-80">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-black">{value}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  کامپوننتِ اصلی
// ══════════════════════════════════════════════════════════════════════

type TabKey = 'accounts' | 'rules' | 'periods' | 'vouchers' | 'rebuild' | 'opening';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'accounts', label: 'حساب‌ها', icon: '🗂️' },
  { key: 'rules', label: 'قواعد نگاشت', icon: '🔗' },
  { key: 'periods', label: 'دوره‌ها', icon: '🗓️' },
  { key: 'vouchers', label: 'اسناد', icon: '🧾' },
  { key: 'rebuild', label: 'بازسازی', icon: '🔄' },
  { key: 'opening', label: 'ماندهٔ افتتاحیه', icon: '🏁' },
];

export default function AccountingClient(props: AccountingProps) {
  const [tab, setTab] = useState<TabKey>('accounts');
  const { accounts, periods, vouchers, rules, reconciliation, trial } = props;

  const openPeriods = periods.filter((p) => p.status === 'OPEN').length;
  const unbalanced = vouchers.filter((v) => Math.round(v.totalDebit) !== Math.round(v.totalCredit)).length;

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      {/* سربرگ */}
      <div className="overflow-hidden rounded-2xl border border-indigo-900/20 bg-gradient-to-l from-indigo-800 via-slate-800 to-slate-900 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-black sm:text-xl">📒 حسابداری و دفتر کل</h1>
            <p className="mt-1 max-w-2xl text-2xs leading-5 text-indigo-100/90">
              کدینگ حساب، قواعدِ نگاشتِ رویدادهای مالی، دوره‌های ماهانه، اسنادِ دستی و افتتاحیه، و بازسازیِ دفتر کل از
              دفتر مالی دانشجو — همه در یک صفحه.
            </p>
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-2xs font-bold">
              🏛️ {props.universityTitle}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-2xs sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 px-3 py-2 text-center">
              <div className="text-3xs opacity-80">حساب‌ها</div>
              <div className="font-mono text-sm font-black">{faNum(accounts.length)}</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2 text-center">
              <div className="text-3xs opacity-80">دورهٔ باز</div>
              <div className="font-mono text-sm font-black">{faNum(openPeriods)}</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2 text-center">
              <div className="text-3xs opacity-80">سندِ ناتراز (۱۰۰ سند آخر)</div>
              <div className="font-mono text-sm font-black">{faNum(unbalanced)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* خلاصهٔ تراز دورهٔ جاری */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-black text-slate-800">
            تراز آزمایشی دورهٔ{' '}
            {trial.periodTitle ? <span className="font-mono">{faNum(trial.periodTitle)}</span> : '—'}
          </h2>
          <span className="text-2xs text-slate-500">
            {trial.from ? `${dateFa(trial.from)} تا ${dateFa(trial.to)}` : 'دوره‌ای برای محاسبهٔ تراز پیدا نشد'}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="جمع بدهکار" value={money(trial.debit)} tone="slate" />
          <Stat label="جمع بستانکار" value={money(trial.credit)} tone="slate" />
          <Stat
            label="اختلاف"
            value={money(Math.abs(trial.debit - trial.credit))}
            tone={Math.round(trial.debit) === Math.round(trial.credit) ? 'emerald' : 'rose'}
          />
          <Stat label="حساب‌های دارای گردش" value={faNum(trial.accountCount)} tone="slate" />
        </div>
        {trial.rows.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {trial.rows.map((r) => (
              <span key={r.code} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-3xs">
                <span className="font-mono text-slate-500">{faNum(r.code)}</span> {r.name}
                <span className="ms-1 font-bold">{money(r.balance)}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* تب‌ها */}
      <div className="tabstrip" role="tablist" aria-label="بخش‌های حسابداری">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              tab === t.key
                ? 'bg-indigo-800 text-white shadow'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="me-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'accounts' ? <AccountsTab accounts={accounts} /> : null}
      {tab === 'rules' ? <RulesTab rules={rules} accounts={accounts} /> : null}
      {tab === 'periods' ? <PeriodsTab periods={periods} canReopen={props.canReopen} /> : null}
      {tab === 'vouchers' ? <VouchersTab vouchers={vouchers} accounts={accounts} todayIso={props.todayIso} /> : null}
      {tab === 'rebuild' ? <RebuildTab reconciliation={reconciliation} /> : null}
      {tab === 'opening' ? (
        <OpeningTab accounts={accounts} todayIso={props.todayIso} hasOpening={props.openingThisMonth} />
      ) : null}
    </div>
  );
}
