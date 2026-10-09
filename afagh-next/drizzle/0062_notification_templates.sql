-- 0062_notification_templates.sql
-- توسعهٔ جدول موجود (نه جدول جدید): عنوان + متغیرها + کانال‌ها + زمان ویرایش
-- برای ویرایشگر قالب‌های چندکاناله. دکمهٔ «ذخیره» تا امروز دروغ می‌گفت.
ALTER TABLE "notification_templates" ADD COLUMN IF NOT EXISTS "title" varchar(150);
ALTER TABLE "notification_templates" ADD COLUMN IF NOT EXISTS "variables" text;
ALTER TABLE "notification_templates" ADD COLUMN IF NOT EXISTS "channels" varchar(100);
ALTER TABLE "notification_templates" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now();
