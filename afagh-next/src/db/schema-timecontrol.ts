// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — «کنترل زمانی دقیق ثبت مالی» (Accounting Period Lock)
//
//  جدول مستقلِ این ماژول — عمداً در schema.ts ثبت نشده تا فایل مشترک
//  دست‌نخورده بماند (سیاست انحصار فایل ماژول، مثل schema-discipline.ts).
//  مهاجرت دستی: drizzle/0082_finance_time_control.sql (idempotent).
//
//  قرارداد ستون‌ها: نام‌های snake_case (برخلاف بقیهٔ schema — طبق مشخصات
//  این ماژول)، timestamptz چون دورهٔ مالی باید بدون ابهام زمانیِ سرور باشد.
//
//  semantics: «تنها یک دورهٔ فعال» — آخرین ردیفِ ثبت‌شده ملاک است
//  (order by id desc). is_locked = قفل دستی توسط مدیر مالی.
// ══════════════════════════════════════════════════════════════════════
import { boolean, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/** دورهٔ مالی باز/بسته — ثبت مالی فقط داخل این پنجره و با is_locked=false مجاز است */
export const accounting_periods = pgTable('accounting_periods', {
  id: serial('id').primaryKey(),
  /** عنوان دوره (مثلاً «دورهٔ مالی ۱۴۰۴ — نیمسال اول») */
  periodName: text('period_name'),
  /** آغاز پنجرهٔ مجازِ ثبت مالی */
  opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
  /** پایان پنجرهٔ مجازِ ثبت مالی */
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
  /** قفل دستی توسط مدیر — حتی داخل پنجره هم ثبت را می‌بندد */
  isLocked: boolean('is_locked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AccountingPeriodRow = typeof accounting_periods.$inferSelect;
