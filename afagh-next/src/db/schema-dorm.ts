// ══════════════════════════════════════════════════════════════════════
//  ماژول الحاقی: «کارت سکونت خوابگاه» (Dormitory Residence Card)
//
//  فایل الحاقی — هیچ فایل موجودی (از جمله src/db/schema.ts) تغییر نکرده است.
//  جدول سکونت خوابگاه پیش‌تر در سامانه وجود نداشت (فقط ستون‌های پراکندهٔ
//  students.dormName / students.dormRoom / students.hasDorm از فایل سما);
//  اینجا یک جدول رسمی برای سکونت‌های دوره‌ای می‌سازیم تا کارت سکونت
//  (نام خوابگاه، اتاق، تخت، سال تحصیلی، بازهٔ اعتبار) قابل صدور و چاپ باشد.
//
//  نام‌گذاری ستون‌ها هم‌راستا با بقیهٔ اسکیما camelCase است (studs.studentId …).
//  اعمال مهاجرت: drizzle/0076_dorm_residences.sql (رجوع شود به INTEGRATION).
// ══════════════════════════════════════════════════════════════════════
import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { students, universities } from '@/db/schema';

/** سکونت خوابگاهی یک دانشجو در یک سال تحصیلی — مبنای «کارت سکونت» */
export const dorm_residences = pgTable('dorm_residences', {
  id: serial('id').primaryKey(),
  /** دانشجوی صاحب سکونت (الزامی) */
  studentId: integer('studentId').notNull().references(() => students.id),
  /** نام خوابگاه (مثلاً «خوابگاه پسرانهٔ شهید بهشتی») */
  dormName: text('dormName'),
  /** شمارهٔ اتاق */
  roomNo: text('roomNo'),
  /** شمارهٔ تخت */
  bedNo: text('bedNo'),
  /** سال تحصیلی (مثلاً «۱۴۰۴-۱۴۰۵») */
  academicYear: text('academicYear'),
  /** شروع اعتبار سکونت */
  validFrom: timestamp('validFrom'),
  /** پایان اعتبار سکونت */
  validTo: timestamp('validTo'),
  /** وضعیت: active | ended | revoked (پیش‌فرض active) */
  status: text('status').notNull().default('active'),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
