// ══════════════════════════════════════════════════════════════════════
//  آفاق ERP — ماژول «شورای آموزشی» (Academic Council)
//
//  بازسازی قابلیت سیستم قدیم (سما): ثبت جلسات شورای آموزشی (تاریخ، عنوان،
//  اعضا، دستور جلسه، صورت‌جلسه) و مصوبات/توصیه‌های/درخواست‌های تجدیدنظر
//  مرتبط با هر جلسه — به‌صورت اختیاری پیوست‌شده به یک دانشجو.
//
//  فایل الحاقی — هیچ فایل مشترکی (از جمله src/db/schema.ts) تغییر نکرده
//  است؛ الگوی «انحصار فایل ماژول» مانند schema-discipline.ts / schema-dorm.ts.
//  مهاجرت دستی: drizzle/0080_council.sql (idempotent — IF NOT EXISTS).
//
//  قرارداد ستون‌ها از schema.ts پیروی می‌کند: نام ستون‌ها camelCase و
//  وضعیت‌ها/نوع‌ها به‌صورت varchar با مقدار فارسی (همان قرارداد statusTitle
//  در student_term_states — متن فارسی = مقدار ذخیره‌شده، نه pgEnum).
// ══════════════════════════════════════════════════════════════════════
import {
  pgTable, serial, integer, varchar, text, timestamp, index, type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { students, universities, users } from './schema';

/**
 * جلسهٔ شورای آموزشی.
 * اعضا به‌صورت متن (هر عضو در یک خط) ذخیره می‌شوند — مطابق سیستم قدیم که
 * فهرست اعضا ساختار ثابتی نداشت (نام + سِمت آزاد).
 */
export const council_meetings = pgTable('council_meetings', {
  id: serial('id').primaryKey(),
  /** عنوان جلسه (مثلاً «جلسهٔ عادی شورای آموزشی — بررسی حذف و اضافه») */
  title: varchar('title', { length: 250 }).notNull(),
  /** تاریخ و ساعت برگزاری جلسه (میلادی — نمایش شمسی در UI) */
  meetingDate: timestamp('meetingDate'),
  /** فهرست اعضا؛ هر عضو در یک خط (نام — سِمت) */
  members: text('members'),
  /** دستور جلسه (متن آزاد، هر بند در یک خط) */
  agenda: text('agenda'),
  /** صورت‌جلسهٔ کامل */
  minutes: text('minutes'),
  /** دانشگاه مالک جلسه (چنددانشگاهی — مثل بقیهٔ جدول‌های مهم) */
  universityId: integer('universityId').references((): AnyPgColumn => universities.id),
  /** ثبت‌کنندهٔ جلسه */
  createdBy: integer('createdBy').references((): AnyPgColumn => users.id),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
}, (t) => [
  // فیلتر بازهٔ تاریخ جلسات
  index('idx_council_meetings_date').on(t.meetingDate),
  // دامنهٔ دانشگاه
  index('idx_council_meetings_uni').on(t.universityId),
]);

/**
 * مصوبهٔ شورای آموزشی — همیشه به یک جلسه وصل است؛ دانشجو اختیاری است
 * (بعضی مصوبات عمومی‌اند، مثلاً تغییر سقف واحد).
 *
 * decisionType: «مصوبه» | «توصیه» | «درخواست تجدیدنظر»
 * implementationStatus: «در انتظار اجرا» | «در حال اجرا» | «اجراشده»
 */
export const council_decisions = pgTable('council_decisions', {
  id: serial('id').primaryKey(),
  /** جلسهٔ مبدأ مصوبه */
  meetingId: integer('meetingId').notNull().references((): AnyPgColumn => council_meetings.id, { onDelete: 'cascade' }),
  /** دانشجوی ذی‌نفع (اختیاری — مصوبات عمومی NULL می‌مانند) */
  studentId: integer('studentId').references((): AnyPgColumn => students.id),
  /** نوع مصوبه — مقدار فارسی، پیش‌فرض «مصوبه» */
  decisionType: varchar('decisionType', { length: 50 }).notNull().default('مصوبه'),
  /** متن کامل مصوبه/توصیه/درخواست */
  content: text('content').notNull(),
  /** وضعیت اجرا — مقدار فارسی، پیش‌فرض «در انتظار اجرا» */
  implementationStatus: varchar('implementationStatus', { length: 30 }).notNull().default('در انتظار اجرا'),
  /** مهلت اجرا (اختیاری) */
  deadline: timestamp('deadline'),
  /** دانشگاه مالک مصوبه (همراه جلسه؛ برای فیلتر مستقیم بدون join) */
  universityId: integer('universityId').references((): AnyPgColumn => universities.id),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
}, (t) => [
  // مصوباتِ هر جلسه
  index('idx_council_decisions_meeting').on(t.meetingId),
  // تاریخچهٔ مصوبات یک دانشجو
  index('idx_council_decisions_student').on(t.studentId),
  // فیلتر فهرست بر اساس وضعیت اجرا
  index('idx_council_decisions_status').on(t.implementationStatus),
  // فیلتر فهرست بر اساس نوع
  index('idx_council_decisions_type').on(t.decisionType),
]);
