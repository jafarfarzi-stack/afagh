// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — «صندوق رفاه» + «فرمول ویژهٔ شهریهٔ یک دانشجو»
//
//  دو شکاف سیستم قدیم (سما) که در آفاق نبود:
//  ۱) صندوق رفاه دانشجویان به‌عنوان مفهوم جدا (نه فقط متن آزاد lender در
//     وام‌ها): کاتالوگ صندوق‌ها + اتصال هر وام به یک صندوق.
//  ۲) فرمول ویژه برای یک دانشجو (مبلغ ثابت/به‌ازای‌واحدِ اختصاصی که جایگزین
//     قاعدهٔ عمومی شهریه می‌شود؛ termId تهی = همهٔ ترم‌ها).
//
//  جدول‌های مستقل این ماژول — عمداً در schema.ts ثبت نشده تا فایل مشترک
//  دست‌نخورده بماند. مهاجرت دستی: drizzle/0081_welfare_student_formula.sql.
// ══════════════════════════════════════════════════════════════════════
import { integer, numeric, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { academic_terms, students, universities, users } from '@/db/schema';

/** کاتالوگ صندوق‌های رفاهی/حمایتی (صندوق رفاه، قرض‌الحسنه، …) */
export const welfare_funds = pgTable('welfare_funds', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  title: varchar('title', { length: 150 }).notNull(),
  description: text('description'),
  isActive: integer('isActive').notNull().default(1),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});

/**
 * فرمول ویژهٔ شهریه برای یک دانشجو — جایگزین قاعدهٔ عمومی در
 * computeTermTuition (اولویت: ترم خاص > همهٔ ترم‌ها).
 * fixedAmount = مبلغ ثابت اختصاصی (ریال)؛ perUnitAmount = نرخ هر واحد (ریال).
 */
export const student_tuition_overrides = pgTable('student_tuition_overrides', {
  id: serial('id').primaryKey(),
  studentId: integer('studentId').notNull().references(() => students.id),
  /** تهی = همهٔ ترم‌ها */
  termId: integer('termId').references(() => academic_terms.id),
  fixedAmount: numeric('fixedAmount', { precision: 12, scale: 0 }).notNull().default('0'),
  perUnitAmount: numeric('perUnitAmount', { precision: 12, scale: 0 }).notNull().default('0'),
  reason: text('reason'),
  isActive: integer('isActive').notNull().default(1),
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export type WelfareFundRow = typeof welfare_funds.$inferSelect;
export type TuitionOverrideRow = typeof student_tuition_overrides.$inferSelect;
