-- ══════════════════════════════════════════════════════════════════════
-- 0036 — ستون‌های زمان‌بندی نیمسال در academic_terms
--
-- چرا؟ فایل زمان‌بندی سما (zamanbandi) برای هر ترم ۱۴ تاریخ دارد
-- (انتخاب واحد، حذف و اخذ، حذف تک‌درس، امتحانات، پیش‌ثبت‌نام، میهمانی)
-- ولی جدول فقط ۴ ستون (start/end/enrollmentStart/enrollmentEnd) داشت.
-- این ۱۰ ستون جدید بقیهٔ بازه‌ها را پوشش می‌دهند؛ اسکریپت
-- scripts/import-term-schedule.mjs آن‌ها را از فایل پر می‌کند.
-- اجرای مجدد بی‌خطر (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "addDropStartDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "addDropEndDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "singleDropStartDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "singleDropEndDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "examStartDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "examEndDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "preRegStartDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "preRegEndDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "guestRegStartDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "guestRegEndDate" timestamp;
