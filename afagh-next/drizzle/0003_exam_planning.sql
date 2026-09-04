-- ════════════════════════════════════════════════════════════════════════
-- 0003 — برنامه‌ریزی امتحانات (فاز ۹) و روز امتحان/دانشجو (فاز ۱۰)
-- ────────────────────────────────────────────────────────────────────────
--  جدید:   exam_calendar_configs   (زون‌بندی تقویم امتحانات هر ترم)
--  ارتقا:  majors.isWorkingClassMajority   (رشتهٔ دارای دانشجوی شاغلِ زیاد)
--          enrollments.hasAcceptedSameDayExam (تأییدیهٔ دیجیتال تداخل نرم)
--
--  ▸ نسخه‌دار (تصمیم D5): هیچ‌چیز به patches.sql نمی‌رود.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_calendar_configs" (
  "id" serial PRIMARY KEY NOT NULL,
  "termId" integer NOT NULL REFERENCES "academic_terms"("id"),
  "globalStart" varchar(10) NOT NULL,
  "globalEnd" varchar(10) NOT NULL,
  "generalStart" varchar(10) NOT NULL,
  "generalEnd" varchar(10) NOT NULL,
  "specializedStart" varchar(10) NOT NULL,
  "specializedEnd" varchar(10) NOT NULL,
  "updatedByUserId" integer REFERENCES "users"("id"),
  "updatedAt" timestamp DEFAULT now(),
  CONSTRAINT "uq_exam_calendar_configs_term" UNIQUE ("termId")
);

--> statement-breakpoint
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "isWorkingClassMajority" boolean NOT NULL DEFAULT false;

--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "hasAcceptedSameDayExam" integer NOT NULL DEFAULT 0;
