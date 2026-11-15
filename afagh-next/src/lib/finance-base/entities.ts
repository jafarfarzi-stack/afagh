/**
 * رجیستریِ اعلانیِ «دادهٔ پایهٔ مالی» — بدون DB، بدون React.
 *
 * ══════════════════════════════════════════════════════════════════════
 *  چرا؟
 *  نُه جدولِ پایهٔ مالی (بودجه، پیمانکار، قرارداد، صورتحساب، هزینه، VAT،
 *  کالا، گردش کالا، پروندهٔ حقوقی) هر کدام ۶ تا ۱۰ فیلد دارند. نوشتنِ
 *  نُه فرم/اکشن/اعتبارسنجِ جداگانه هم پرحجم است هم مستعدِ ناهم‌راستی.
 *
 *  اینجا فقط **توصیف** می‌کنیم: هر موجودیت چه فیلدهایی دارد، کدام‌ها
 *  الزامی‌اند، چه نوعی دارند. یک لایهٔ مشترک (validate + route + UI)
 *  از همین توصیف، فرم و اعتبارسنجی می‌سازد.
 *
 *  ⚠ این فایل عمداً هیچ import‌ای از Drizzle ندارد تا در تستِ خالص
 *    (بدون اتصال DB) قابلِ بارگذاری باشد. نگاشتِ key → جدول در
 *    `src/app/api/admin/finance/base-data/route.ts` (سمتِ سرور) است.
 * ══════════════════════════════════════════════════════════════════════
 */

/** نوعِ فیلد — تعیین‌کنندهٔ کنترلِ فرم و قاعدهٔ اعتبارسنجی */
export type FieldKind =
  | 'text'
  | 'textarea'
  | 'money'
  | 'number'
  | 'date'
  | 'select'
  | 'ref'
  | 'term'
  | 'termCode';

/** موجودیت‌هایی که فیلدِ ارجاعی می‌تواند به آن‌ها اشاره کند */
export type RefTarget = 'contractors' | 'contracts' | 'inventory-items';

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  /** نامِ ستون در جدول (camelCase، همان‌طور که Drizzle انتظار دارد) */
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** فقط برای kind='select' */
  options?: SelectOption[];
  /** فقط برای kind='ref' */
  ref?: RefTarget;
  /** حداکثر طول رشته (برای text/textarea) */
  maxLength?: number;
  /** متنِ راهنما زیر فیلد */
  hint?: string;
}

export interface EntitySpec {
  /** کلیدِ یکتا در URL و API */
  key: string;
  /** نامِ جدول در `src/db/schema.ts` — برای تستِ ثبات */
  table: string;
  title: string;
  icon: string;
  /** گزارش‌هایی که از این داده تغذیه می‌شوند (فقط برای راهنمای UI) */
  feeds: string[];
  fields: FieldSpec[];
  /** ستون‌هایی که در جدولِ فهرست نشان داده می‌شوند */
  list: string[];
  /** ستونِ مرتب‌سازی نزولی (پیش‌فرض id) */
  orderBy?: string;
}

// ── گزینه‌های مشترک ─────────────────────────────────────────────────

const DIRECTIONS: SelectOption[] = [
  { value: 'EXPENSE', label: 'هزینه' },
  { value: 'REVENUE', label: 'درآمد' },
];

const CONTRACT_STATUS: SelectOption[] = [
  { value: 'DRAFT', label: 'پیش‌نویس' },
  { value: 'ACTIVE', label: 'جاری' },
  { value: 'SETTLED', label: 'تسویه‌شده' },
  { value: 'TERMINATED', label: 'فسخ‌شده' },
];

const LEGAL_STATUS: SelectOption[] = [
  { value: 'OPEN', label: 'باز' },
  { value: 'IN_PROGRESS', label: 'در جریان' },
  { value: 'CLOSED', label: 'مختومه' },
  { value: 'SUSPENDED', label: 'متوقف' },
];

const VAT_SOURCE: SelectOption[] = [
  { value: 'INVOICE', label: 'فاکتور فروش' },
  { value: 'CONTRACT', label: 'صورتحساب پیمانکار' },
  { value: 'EXPENSE', label: 'هزینه' },
];

const MOVE_DIRECTION: SelectOption[] = [
  { value: 'IN', label: 'ورود' },
  { value: 'OUT', label: 'خروج' },
];

// ── موجودیت‌ها ──────────────────────────────────────────────────────

export const ENTITIES: readonly EntitySpec[] = [
  {
    key: 'budgets',
    table: 'financial_budgets',
    title: 'بودجهٔ مصوب',
    icon: '📊',
    feeds: ['budget-variance', 'income-statement', 'revenue-hierarchy'],
    orderBy: 'id',
    list: ['termCode', 'category', 'lineItem', 'direction', 'amount'],
    fields: [
      { name: 'termCode', label: 'نیمسال', kind: 'termCode', hint: 'خالی = بودجهٔ سالانه' },
      { name: 'category', label: 'گروه بودجه', kind: 'text', required: true, maxLength: 80, hint: 'مثلاً آموزشی، اداری، پشتیبانی' },
      { name: 'lineItem', label: 'عنوان قلم', kind: 'text', required: true, maxLength: 160 },
      { name: 'direction', label: 'جهت', kind: 'select', required: true, options: DIRECTIONS },
      { name: 'amount', label: 'مبلغ مصوب (ریال)', kind: 'money', required: true },
      { name: 'description', label: 'توضیح', kind: 'textarea', maxLength: 2000 },
    ],
  },
  {
    key: 'contractors',
    table: 'financial_contractors',
    title: 'پیمانکاران و تأمین‌کنندگان',
    icon: '🏗️',
    feeds: ['contractor-report', 'contractor-settlement', 'company-expenses'],
    orderBy: 'id',
    list: ['name', 'identifier', 'category', 'phone', 'email'],
    fields: [
      { name: 'name', label: 'نام', kind: 'text', required: true, maxLength: 160 },
      { name: 'identifier', label: 'شناسهٔ ملی / اقتصادی', kind: 'text', maxLength: 40 },
      { name: 'category', label: 'نوع', kind: 'text', maxLength: 60, hint: 'پیمانکار، مشاور، تأمین‌کننده…' },
      { name: 'phone', label: 'تلفن', kind: 'text', maxLength: 40 },
      { name: 'email', label: 'ایمیل', kind: 'text', maxLength: 120 },
      { name: 'address', label: 'نشانی', kind: 'textarea', maxLength: 1000 },
      { name: 'notes', label: 'یادداشت', kind: 'textarea', maxLength: 2000 },
    ],
  },
  {
    key: 'contracts',
    table: 'financial_contracts',
    title: 'قراردادها',
    icon: '📝',
    feeds: ['contractor-report', 'contractor-settlement', 'balance-sheet'],
    orderBy: 'id',
    list: ['contractNo', 'contractorId', 'subject', 'amount', 'paidAmount', 'status'],
    fields: [
      { name: 'contractorId', label: 'پیمانکار', kind: 'ref', ref: 'contractors', required: true },
      { name: 'contractNo', label: 'شمارهٔ قرارداد', kind: 'text', maxLength: 60 },
      { name: 'subject', label: 'موضوع', kind: 'text', maxLength: 240 },
      { name: 'termId', label: 'نیمسال', kind: 'term', hint: 'خالی = قرارداد سالانه' },
      { name: 'signedAt', label: 'تاریخ انعقاد', kind: 'date' },
      { name: 'amount', label: 'مبلغ قرارداد (ریال)', kind: 'money', required: true },
      { name: 'paidAmount', label: 'پرداخت‌شده (ریال)', kind: 'money' },
      { name: 'status', label: 'وضعیت', kind: 'select', required: true, options: CONTRACT_STATUS },
      { name: 'notes', label: 'یادداشت', kind: 'textarea', maxLength: 2000 },
    ],
  },
  {
    key: 'contract-invoices',
    table: 'financial_contract_invoices',
    title: 'صورتحساب پیمانکاران',
    icon: '🧾',
    feeds: ['contractor-settlement', 'vat-report'],
    orderBy: 'id',
    list: ['invoiceNo', 'contractId', 'invoiceDate', 'grossAmount', 'vatAmount', 'paidAmount'],
    fields: [
      { name: 'contractId', label: 'قرارداد', kind: 'ref', ref: 'contracts', required: true },
      { name: 'invoiceNo', label: 'شمارهٔ صورتحساب', kind: 'text', maxLength: 60 },
      { name: 'invoiceDate', label: 'تاریخ', kind: 'date' },
      { name: 'description', label: 'شرح', kind: 'textarea', maxLength: 2000 },
      { name: 'grossAmount', label: 'مبلغ بدون مالیات (ریال)', kind: 'money', required: true },
      { name: 'vatAmount', label: 'مالیات ارزش افزوده (ریال)', kind: 'money' },
      { name: 'paidAmount', label: 'پرداخت‌شده (ریال)', kind: 'money' },
    ],
  },
  {
    key: 'expenses',
    table: 'financial_expenses',
    title: 'هزینه‌های شرکت',
    icon: '💸',
    feeds: ['company-expenses', 'income-statement', 'costing-report', 'allocation-report', 'cash-flow'],
    orderBy: 'id',
    list: ['category', 'title', 'expenseDate', 'netAmount', 'vatAmount', 'paidAmount'],
    fields: [
      { name: 'category', label: 'گروه هزینه', kind: 'text', required: true, maxLength: 80, hint: 'اداری، تأسیسات، فناوری…' },
      { name: 'title', label: 'شرح هزینه', kind: 'text', required: true, maxLength: 240 },
      { name: 'termId', label: 'نیمسال', kind: 'term', hint: 'خالی = سالانه' },
      { name: 'expenseDate', label: 'تاریخ', kind: 'date' },
      { name: 'documentNo', label: 'شمارهٔ سند/فاکتور', kind: 'text', maxLength: 60 },
      { name: 'netAmount', label: 'مبلغ بدون مالیات (ریال)', kind: 'money', required: true },
      { name: 'vatAmount', label: 'مالیات ارزش افزوده (ریال)', kind: 'money' },
      { name: 'paidAmount', label: 'پرداخت‌شده (ریال)', kind: 'money' },
      { name: 'description', label: 'توضیح', kind: 'textarea', maxLength: 2000 },
    ],
  },
  {
    key: 'vat',
    table: 'financial_vat_entries',
    title: 'مالیات بر ارزش افزوده',
    icon: '🧮',
    feeds: ['vat-report', 'balance-sheet'],
    orderBy: 'id',
    list: ['source', 'documentNo', 'entryDate', 'netAmount', 'rate', 'vatAmount'],
    fields: [
      { name: 'source', label: 'منبع سند', kind: 'select', required: true, options: VAT_SOURCE },
      { name: 'documentNo', label: 'شمارهٔ سند', kind: 'text', maxLength: 60 },
      { name: 'entryDate', label: 'تاریخ', kind: 'date' },
      { name: 'termId', label: 'نیمسال', kind: 'term' },
      { name: 'netAmount', label: 'مبلغ مشمول (ریال)', kind: 'money', required: true },
      { name: 'rate', label: 'نرخ (درصد)', kind: 'number', hint: 'مثلاً ۱۰' },
      { name: 'vatAmount', label: 'مبلغ مالیات (ریال)', kind: 'money' },
    ],
  },
  {
    key: 'inventory-items',
    table: 'inventory_items',
    title: 'کالا و ملزومات',
    icon: '📦',
    feeds: ['inventory-report'],
    orderBy: 'id',
    list: ['code', 'name', 'category', 'unitName', 'unitPrice'],
    fields: [
      { name: 'code', label: 'کد کالا', kind: 'text', maxLength: 40 },
      { name: 'name', label: 'نام کالا', kind: 'text', required: true, maxLength: 160 },
      { name: 'category', label: 'گروه', kind: 'text', maxLength: 80 },
      { name: 'unitName', label: 'واحد شمارش', kind: 'text', maxLength: 30, hint: 'عدد، کیلوگرم، بسته…' },
      { name: 'unitPrice', label: 'بهای واحد (ریال)', kind: 'money' },
      { name: 'notes', label: 'یادداشت', kind: 'textarea', maxLength: 2000 },
    ],
  },
  {
    key: 'inventory-movements',
    table: 'inventory_movements',
    title: 'گردش کالا',
    icon: '🔁',
    feeds: ['inventory-report'],
    orderBy: 'id',
    list: ['itemId', 'direction', 'quantity', 'unitPrice', 'movementDate', 'documentNo'],
    fields: [
      { name: 'itemId', label: 'کالا', kind: 'ref', ref: 'inventory-items', required: true },
      { name: 'direction', label: 'جهت', kind: 'select', required: true, options: MOVE_DIRECTION },
      { name: 'quantity', label: 'مقدار', kind: 'number', required: true },
      { name: 'unitPrice', label: 'بهای واحد (ریال)', kind: 'money' },
      { name: 'movementDate', label: 'تاریخ', kind: 'date' },
      { name: 'documentNo', label: 'شمارهٔ سند', kind: 'text', maxLength: 60 },
      { name: 'description', label: 'توضیح', kind: 'textarea', maxLength: 2000 },
    ],
  },
  {
    key: 'legal-cases',
    table: 'legal_cases',
    title: 'پرونده‌های حقوقی',
    icon: '⚖️',
    feeds: ['legal-report'],
    orderBy: 'id',
    list: ['caseNo', 'subject', 'caseType', 'partyName', 'status', 'amount'],
    fields: [
      { name: 'caseNo', label: 'شمارهٔ پرونده', kind: 'text', maxLength: 60 },
      { name: 'subject', label: 'موضوع', kind: 'text', required: true, maxLength: 240 },
      { name: 'caseType', label: 'نوع پرونده', kind: 'text', maxLength: 60 },
      { name: 'partyName', label: 'طرف پرونده', kind: 'text', maxLength: 160 },
      { name: 'status', label: 'وضعیت', kind: 'select', required: true, options: LEGAL_STATUS },
      { name: 'amount', label: 'مبلغ مورد دعوا (ریال)', kind: 'money' },
      { name: 'openedAt', label: 'تاریخ گشایش', kind: 'date' },
      { name: 'closedAt', label: 'تاریخ اختتام', kind: 'date' },
      { name: 'description', label: 'توضیح', kind: 'textarea', maxLength: 2000 },
    ],
  },
] as const;

/** نگاشتِ سریعِ key → spec */
export const ENTITY_BY_KEY: Readonly<Record<string, EntitySpec>> = Object.freeze(
  Object.fromEntries(ENTITIES.map((e) => [e.key, e])),
);

export const ENTITY_KEYS: readonly string[] = ENTITIES.map((e) => e.key);

export function getEntity(key: string): EntitySpec | null {
  return ENTITY_BY_KEY[key] ?? null;
}

/** فیلدهای قابلِ ارجاع از موجودیت‌های دیگر (برای بارگذاری گزینه‌ها) */
export function refTargetsOf(spec: EntitySpec): RefTarget[] {
  const set = new Set<RefTarget>();
  for (const f of spec.fields) if (f.kind === 'ref' && f.ref) set.add(f.ref);
  return [...set];
}

/** آیا این موجودیت فیلدِ نیمسال دارد؟ */
export function needsTerms(spec: EntitySpec): boolean {
  return spec.fields.some((f) => f.kind === 'term' || f.kind === 'termCode');
}

/** برچسبِ فارسیِ یک مقدار گزینه (برای نمایش در جدول) */
export function optionLabel(spec: EntitySpec, field: string, value: unknown): string {
  const f = spec.fields.find((x) => x.name === field);
  if (!f?.options) return String(value ?? '');
  const hit = f.options.find((o) => o.value === String(value ?? ''));
  return hit?.label ?? String(value ?? '');
}
