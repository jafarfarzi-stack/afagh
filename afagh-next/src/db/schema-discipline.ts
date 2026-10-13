// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — ماژول «کمیته انضباطی» (Discipline Committee)
//
//  جدول‌های مستقلِ این ماژول — عمداً در schema.ts ثبت نشده‌اند تا فایل
//  مشترک دست‌نخورده بماند (سیاست انحصار فایل ماژول). مهاجرت دستی:
//  drizzle/0076_discipline.sql (idempotent — IF NOT EXISTS).
//
//  قرارداد ستون‌ها از الگوی schema.ts پیروی می‌کند: نام ستون‌ها camelCase،
//  وضعیت‌ها/تصمیم‌ها به‌صورت varchar با مقدار فارسی (مثل statusTitle در
//  student_term_states — متن فارسی = مقدار ذخیره‌شده).
// ══════════════════════════════════════════════════════════════════════
import {
  pgTable, serial, integer, varchar, text, timestamp, index, type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { students, universities } from './schema';

/**
 * پروندهٔ انضباطی یک دانشجو.
 * وضعیت‌ها: «در حال بررسی» ← «در کمیته» ← «تصمیم‌گیری‌شده» ← (قابل اعتراض) «تجدیدنظر»
 * تصمیم کمیته: تذکر شفاهی / تذکر کتبی / اخطار / تعلیق موقت / اخراج / تبرئه
 */
export const discipline_cases = pgTable('discipline_cases', {
  id: serial('id').primaryKey(),
  /** دانشجوی ذی‌نفع پرونده */
  studentId: integer('studentId').notNull().references(() => students.id),
  /** نوع تخلف (مثلاً «تقلب در امتحان»، «غیبت غیرموجه»، …) */
  violationType: varchar('violationType', { length: 150 }).notNull(),
  /** شرح تخلف / شکایت */
  description: text('description'),
  /** گزارش‌دهنده (استاد/کارشناس/معاونت) — متن آزاد از سیستم قدیم */
  reporterName: varchar('reporterName', { length: 150 }),
  /** وضعیت پرونده — مقدار فارسی، پیش‌فرض «در حال بررسی» */
  status: varchar('status', { length: 30 }).notNull().default('در حال بررسی'),
  /** تصمیم کمیته — NULL = هنوز تصمیمی گرفته نشده */
  committeeDecision: varchar('committeeDecision', { length: 100 }),
  /** توضیحات تصمیم / مصوبهٔ کمیته */
  decisionNotes: text('decisionNotes'),
  /** تاریخ وقوع/ثبت تخلف (میلادی — نمایش شمسی در UI) */
  caseDate: timestamp('caseDate').defaultNow(),
  /** زمان ثبت تصمیم نهایی — با اولین تصمیم‌گیری پر می‌شود */
  decidedAt: timestamp('decidedAt'),
  /** دانشگاه مالک پرونده (چنددانشگاهی — مثل بقیهٔ جدول‌های مهم) */
  universityId: integer('universityId').references((): AnyPgColumn => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
}, (t) => [
  // سوابق هر دانشجو (فیلتر «تاریخچهٔ پرونده‌های دانشجو»)
  index('idx_discipline_cases_student').on(t.studentId),
  // فیلتر فهرست بر اساس وضعیت
  index('idx_discipline_cases_status').on(t.status),
  // فیلتر بازهٔ تاریخ
  index('idx_discipline_cases_caseDate').on(t.caseDate),
]);

/** سند/مدرک پیوست پروندهٔ انضباطی (فایل خودِ در Object Storage می‌ماند — فقط کلید/لینک اینجاست). */
export const discipline_case_documents = pgTable('discipline_case_documents', {
  id: serial('id').primaryKey(),
  caseId: integer('caseId').notNull().references(() => discipline_cases.id, { onDelete: 'cascade' }),
  fileName: varchar('fileName', { length: 250 }).notNull(),
  fileUrl: varchar('fileUrl', { length: 500 }).notNull(),
  uploadedAt: timestamp('uploadedAt').defaultNow(),
}, (t) => [
  index('idx_discipline_case_documents_case').on(t.caseId),
]);
