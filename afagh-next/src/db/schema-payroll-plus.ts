// ══════════════════════════════════════════════════════════════════════
//  ماژول‌های الحاقی حق‌التدریس — شکاف‌های راهنمای قدیم (Teacher Salary)
//  مهاجرت‌ها: drizzle/0083 تا 0088. هیچ جدول موجودی تغییر نمی‌کند؛
//  ALTERهای جدول‌های موجود فقط در SQL انجام می‌شود + ستون‌ها در schema.ts.
// ══════════════════════════════════════════════════════════════════════
import { pgTable, serial, integer, text, timestamp, varchar, numeric } from 'drizzle-orm/pg-core';
import { course_offerings, staff, students, academic_terms, universities, users, payroll_statements } from '@/db/schema';

// ── 0083: دفتر «واحد باقی‌مانده» پایان‌نامه ──────────────────────────

/** سرجمع هر پایان‌نامه/معرفی به استاد برای یک استاد (نقش راهنما/مشاور) */
export const thesis_supervisions = pgTable('thesis_supervisions', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  studentId: integer('studentId').references(() => students.id),
  /** نام دانشجو وقتی پروندهٔ دانشجویی ثبت نشده (دستی) */
  studentNameManual: varchar('studentNameManual', { length: 150 }),
  title: varchar('title', { length: 300 }).notNull(),
  /** سقف واحد این پایان‌نامه (مثلاً ۶ برای ارشد) */
  totalUnits: numeric('totalUnits', { precision: 4, scale: 2 }).notNull().default('6'),
  /** SUPERVISOR = راهنما | ADVISOR = مشاور */
  role: varchar('role', { length: 20 }).notNull().default('SUPERVISOR'),
  /** ONGOING | COMPLETED | CANCELLED */
  status: varchar('status', { length: 20 }).notNull().default('ONGOING'),
  /** اتصال اختیاری به پروندهٔ پایان‌نامهٔ ماژول فارغ‌التحصیلی */
  thesisProgressId: integer('thesisProgressId'),
  startTermId: integer('startTermId').references(() => academic_terms.id),
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

/** برداشت مرحله‌ای واحد از یک سرجمع، در هر ابلاغ/ترم */
export const thesis_unit_draws = pgTable('thesis_unit_draws', {
  id: serial('id').primaryKey(),
  supervisionId: integer('supervisionId').notNull().references(() => thesis_supervisions.id, { onDelete: 'cascade' }),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  units: numeric('units', { precision: 4, scale: 2 }).notNull(),
  note: varchar('note', { length: 300 }),
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

// ── 0084: ابلاغ آموزشی با شمارهٔ دبیرخانه ────────────────────────────

/** شمارندهٔ پیاپی شمارهٔ دبیرخانه به تفکیک دانشگاه */
export const decree_counters = pgTable('decree_counters', {
  universityId: integer('universityId').notNull().references(() => universities.id).unique(),
  lastNo: integer('lastNo').notNull().default(0),
});

/** سند ابلاغ آموزشی یک استاد در یک ترم */
export const teaching_decrees = pgTable('teaching_decrees', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  /** شمارهٔ دبیرخانهٔ پیاپی (یکcannot در هر دانشگاه) */
  secretariatNo: integer('secretariatNo').notNull(),
  /** DRAFT | ISSUED */
  status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
  /** اسنپ‌شات کامل محاسبه در لحظهٔ صدور (JSON) */
  snapshotJson: text('snapshotJson'),
  /** ۴ جایگاه امضا: [{title, name}] */
  signersJson: text('signersJson'),
  issuedBy: integer('issuedBy').references(() => users.id),
  issuedAt: timestamp('issuedAt'),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

/** اقلام ابلاغ به تفکیک ۷ بخش */
export const decree_items = pgTable('decree_items', {
  id: serial('id').primaryKey(),
  decreeId: integer('decreeId').notNull().references(() => teaching_decrees.id, { onDelete: 'cascade' }),
  /** COURSES | THESIS | ACTIVITIES | EXAM | SCHEDULE | SUMMARY | (امضا در signersJson) */
  section: varchar('section', { length: 20 }).notNull(),
  title: varchar('title', { length: 300 }).notNull(),
  units: numeric('units', { precision: 6, scale: 2 }),
  amount: numeric('amount', { precision: 12, scale: 0 }),
  metaJson: text('metaJson'),
});

// ── 0085: نسخه‌بندی آیین‌نامه ────────────────────────────────────────

/** آیین‌نامهٔ حق‌التدریس با کد سال/نیمسال */
export const payroll_regulation_versions = pgTable('payroll_regulation_versions', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 30 }).notNull(),
  title: varchar('title', { length: 150 }).notNull(),
  year: integer('year'),
  description: text('description'),
  isActive: integer('isActive').notNull().default(1),
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

// ── 0087: افزوده‌های سطح درس-استاد ───────────────────────────────────

export const offering_payroll_extras = pgTable('offering_payroll_extras', {
  id: serial('id').primaryKey(),
  offeringId: integer('offeringId').notNull().references(() => course_offerings.id),
  staffId: integer('staffId').notNull().references(() => staff.id),
  extraUnits: numeric('extraUnits', { precision: 5, scale: 2 }).notNull().default('0'),
  flatAmount: integer('flatAmount').notNull().default(0),
  reason: text('reason'),
  // ── 0089: نقش دستی استاد در این ارائه (کد از کاتالوگ teaching_role_defs؛ NULL = خودکار)
  payRoleOverride: varchar('payRoleOverride', { length: 50 }),
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

// ── 0087: فعالیت کیفی، فوق‌العاده‌ها، مبالغ نقدی ─────────────────────

/** کاتالوگ فعالیت‌های کیفی قابل تبدیل به واحد کمی */
export const qualitative_activity_types = pgTable('qualitative_activity_types', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  scoreUnit: varchar('scoreUnit', { length: 20 }).notNull().default('HOUR'),
  quantFactor: numeric('quantFactor', { precision: 8, scale: 4 }).notNull().default('1'),
  isActive: integer('isActive').notNull().default(1),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

/** ثبت فعالیت یک استاد در ترم (پس از تأیید وارد فیش می‌شود) */
export const staff_activity_entries = pgTable('staff_activity_entries', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  activityTypeId: integer('activityTypeId').notNull().references(() => qualitative_activity_types.id),
  quantity: numeric('quantity', { precision: 8, scale: 2 }).notNull().default('0'),
  note: text('note'),
  /** PENDING | APPROVED | REJECTED */
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  decidedBy: integer('decidedBy').references(() => users.id),
  decidedAt: timestamp('decidedAt'),
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

/** اقلام فوق‌العادهٔ فیش (مخصوص/جذب/ویژه/آب‌وهوا) — وصل به فیش */
export const payroll_allowance_items = pgTable('payroll_allowance_items', {
  id: serial('id').primaryKey(),
  statementId: integer('statementId').notNull().references(() => payroll_statements.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  amount: integer('amount').notNull().default(0),
  /** ALLOWANCE | BONUS | DEDUCTION */
  kind: varchar('kind', { length: 30 }).notNull().default('ALLOWANCE'),
  createdBy: integer('createdBy').references(() => users.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

/** مبالغ نقدی جنبی ترم استاد (حق‌الزحمه آزمون/مراقبت، داوری دفاع، سایر) */
export const payroll_cash_extras = pgTable('payroll_cash_extras', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  title: text('title').notNull(),
  amount: integer('amount').notNull().default(0),
  reason: text('reason'),
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

// ── 0088: پرداخت امتحانی + اعتراض استاد ───────────────────────────────

/** پرداخت امتحانی ترم (مراقبت/تصحیح/اجرا) — وصل به ابلاغ */
export const exam_payments = pgTable('exam_payments', {
  id: serial('id').primaryKey(),
  staffId: integer('staffId').notNull().references(() => staff.id),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  /** INVIGILATION | CORRECTION | EXEC */
  source: varchar('source', { length: 20 }).notNull().default('INVIGILATION'),
  sessionCount: integer('sessionCount').notNull().default(0),
  unitCount: numeric('unitCount', { precision: 8, scale: 2 }).notNull().default('0'),
  amount: integer('amount').notNull().default(0),
  decreeId: integer('decreeId').references(() => teaching_decrees.id),
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

/** اعتراض استاد به فیش — چرخه: OPEN → RESOLVED | REJECTED */
export const payroll_objections = pgTable('payroll_objections', {
  id: serial('id').primaryKey(),
  statementId: integer('statementId').notNull().references(() => payroll_statements.id, { onDelete: 'cascade' }),
  staffId: integer('staffId').notNull().references(() => staff.id),
  termId: integer('termId').notNull().references(() => academic_terms.id),
  text: text('text').notNull(),
  /** OPEN | RESOLVED | REJECTED */
  status: varchar('status', { length: 20 }).notNull().default('OPEN'),
  reviewNote: text('reviewNote'),
  reviewedBy: integer('reviewedBy').references(() => users.id),
  reviewedAt: timestamp('reviewedAt'),
  /** ۱ = بررسی منجر به بازگشایی فیش شد */
  reopenedStatement: integer('reopenedStatement').notNull().default(0),
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

// ── 0089: کاتالوگ نقش‌های قابل تعریف استاد در درس ────────────────────

/** نقش استاد در درس — قابل‌تعریف توسط مدیر (کمک‌استاد، استاد خودخوان…) */
export const teaching_role_defs = pgTable('teaching_role_defs', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 100 }).notNull(),
  description: text('description'),
  isActive: integer('isActive').notNull().default(1),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

export type ThesisSupervisionRow = typeof thesis_supervisions.$inferSelect;
export type ThesisDrawRow = typeof thesis_unit_draws.$inferSelect;
export type TeachingDecreeRow = typeof teaching_decrees.$inferSelect;
export type RegulationVersionRow = typeof payroll_regulation_versions.$inferSelect;
export type OfferingPayrollExtraRow = typeof offering_payroll_extras.$inferSelect;
export type ActivityEntryRow = typeof staff_activity_entries.$inferSelect;
export type AllowanceItemRow = typeof payroll_allowance_items.$inferSelect;
export type CashExtraRow = typeof payroll_cash_extras.$inferSelect;
export type ExamPaymentRow = typeof exam_payments.$inferSelect;
export type PayrollObjectionRow = typeof payroll_objections.$inferSelect;
export type TeachingRoleDefRow = typeof teaching_role_defs.$inferSelect;
