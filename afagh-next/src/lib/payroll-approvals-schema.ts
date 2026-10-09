// ══════════════════════════════════════════════════════════════════════
//  زنجیرهٔ تأیید فیش حق‌التدریس (payroll_approvals) — تعریف Drizzle
//
//  ⚠ مالکیت: این فایل متعلق به «عامل زنجیرهٔ تأیید» است. جدول‌های موتور
//  (payroll_statements و…) در src/db/schema.ts می‌مانند (مالک: عامل اسنپ‌شات).
//  برای FK فقط از schema.ts ایمپورت خواندنی می‌شود؛ هیچ تغییری در آن نیست.
// ══════════════════════════════════════════════════════════════════════
import { index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { payroll_statements, users } from '@/db/schema';

/** مرحلهٔ زنجیره: DEPT_HEAD (مدیر گروه) · DEAN (معاونت آموزشی) · FINANCE (تسویهٔ مالی) */
export const PAYROLL_APPROVAL_STAGES = ['DEPT_HEAD', 'DEAN', 'FINANCE'] as const;
export type PayrollApprovalStage = (typeof PAYROLL_APPROVAL_STAGES)[number];

/** کنش: APPROVE (تأیید) · RETURN (بازگشت برای اصلاح → DRAFT/MID_TERM_PAID) · REJECT (ردّ نهایی → REJECTED) */
export const PAYROLL_APPROVAL_ACTIONS = ['APPROVE', 'REJECT', 'RETURN'] as const;
export type PayrollApprovalAction = (typeof PAYROLL_APPROVAL_ACTIONS)[number];

/**
 * تاریخچهٔ append-only زنجیرهٔ تأیید فیش — هر گذارِ وضعیت دقیقاً یک ردیف.
 * ماشین وضعیت روی payroll_statements.status (بدون قید CHECK در اسکیما):
 *   DRAFT → DEPT_HEAD_APPROVED → DEAN_APPROVED → FINAL_SETTLED
 *   DRAFT → MID_TERM_PAID (علی‌الحساب، بیرون از زنجیره — مستقیم ADMIN)
 *   MID_TERM_PAID → DEPT_HEAD_APPROVED → DEAN_APPROVED → FINAL_SETTLED
 *   DEPT_HEAD_APPROVED|DEAN_APPROVED →(RETURN)→ DRAFT یا MID_TERM_PAID (بسته به پرداخت میان‌ترم)
 *   * →(REJECT)→ REJECTED (پایانی؛ محاسبهٔ مجدد آن را به DRAFT برمی‌گرداند)
 */
export const payroll_approvals = pgTable('payroll_approvals', {
  id: serial('id').primaryKey(),
  statementId: integer('statementId').notNull().references(() => payroll_statements.id, { onDelete: 'cascade' }),
  stage: varchar('stage', { length: 20 }).notNull(),
  actorUserId: integer('actorUserId').references(() => users.id),
  actorRole: varchar('actorRole', { length: 30 }).notNull(),
  action: varchar('action', { length: 20 }).notNull(),
  note: text('note'),
  createdAt: timestamp('createdAt').defaultNow(),
}, (t) => [
  index('idx_payroll_approvals_statement').on(t.statementId),
]);
