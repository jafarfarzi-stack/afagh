// ══════════════════════════════════════════════════════════════════════
//  ماژول الحاقی: «تأییدیهٔ انتخاب واحد انگلیسی» (English Course Enrollment Approval)
//
//  فایل الحاقی — هیچ فایل موجودی تغییر نکرده است. در سیستم قدیم (سما) ثبت
//  درس «زبان انگلیسی» یک مرحلهٔ تأیید جدا داشت؛ این جدول پایهٔ همان مرحله
//  در آفاق است: درخواستِ تأیید ثبت‌نام درس انگلیسی → بررسی/تأیید/رد کارشناس.
//
//  ثبت درخواست: createEnrollmentApprovalRequest در src/lib/enrollment-approvals.ts
//  (نقطهٔ اتصال به جریان انتخاب واحد — رجوع شود به INTEGRATION).
//  اعمال مهاجرت: drizzle/0078_english_enrollment_approvals.sql.
// ══════════════════════════════════════════════════════════════════════
import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { course_offerings, students, universities, users } from '@/db/schema';

/** درخواست تأیید ثبت‌نام درس انگلیسی — چرخه: PENDING → APPROVED | REJECTED */
export const english_enrollment_approvals = pgTable('english_enrollment_approvals', {
  id: serial('id').primaryKey(),
  /** دانشجوی متقاضی (الزامی) */
  studentId: integer('studentId').notNull().references(() => students.id),
  /** ارائهٔ درس انگلیسی که ثبت‌نامش نیازمند تأیید است */
  offeringId: integer('offeringId').notNull().references(() => course_offerings.id),
  /** PENDING | APPROVED | REJECTED (پیش‌فرض PENDING) */
  status: text('status').notNull().default('PENDING'),
  /** کاربر ایجادکنندهٔ درخواست (دانشجو یا کارشناسی که به‌جای او ثبت کرده) */
  requestedBy: integer('requestedBy').references(() => users.id),
  /** کاربر تصمیم‌گیرنده (تأیید/رد) */
  decidedBy: integer('decidedBy').references(() => users.id),
  decidedAt: timestamp('decidedAt'),
  /** توضیح/دلیل تصمیم */
  note: text('note'),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});
