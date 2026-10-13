// ══════════════════════════════════════════════════════════════════════
//  ماژول الحاقی: «هشدارهای زمان‌بندی‌شدهٔ دانشجو» (Scheduled Warnings)
//
//  فایل الحاقی — هیچ فایل موجودی تغییر نکرده است. سیستم قدیم (سما) هشدارهای
//  زمان‌بندی‌شده (یادآوری شهریه، غیبت زیاد، نقص مدارک…) را در موعد مقرر
//  برای دانشجو می‌فرستاد؛ این جدول پایهٔ همان قابلیت در آفاق است.
//
//  اجرا: runPendingWarnings() در src/lib/scheduled-warnings.ts — توسط کرون
//  /api/cron/scheduled-warnings (یا هر زمان‌بند دیگری) فراخوانی می‌شود.
//  اعمال مهاجرت: drizzle/0077_scheduled_warnings.sql.
// ══════════════════════════════════════════════════════════════════════
import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { students, universities, users } from '@/db/schema';

/** یک هشدار زمان‌بندی‌شده برای یک دانشجو — در موعدش ارسال و «ارسال‌شده» می‌شود */
export const scheduled_warnings = pgTable('scheduled_warnings', {
  id: serial('id').primaryKey(),
  /** دانشجوی گیرنده (الزامی) */
  studentId: integer('studentId').notNull().references(() => students.id),
  /** نوع هشدار: TUITION_DEADLINE | LOW_ATTENDANCE | MISSING_DOCS | CUSTOM … */
  warningType: text('warningType'),
  title: text('title'),
  message: text('message'),
  /** موعد ارسال — ردیف‌های pending با send_at <= NOW توسط کرون ارسال می‌شوند */
  sendAt: timestamp('sendAt').notNull(),
  /** زمان ارسال واقعی (NULL = هنوز ارسال نشده) */
  sentAt: timestamp('sentAt'),
  /** pending | sent | cancelled (پیش‌فرض pending) */
  status: text('status').notNull().default('pending'),
  /** کاربر ایجادکنندهٔ هشدار (کارشناس/مدیر) */
  createdBy: integer('createdBy').references(() => users.id),
  universityId: integer('universityId').references(() => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
});
