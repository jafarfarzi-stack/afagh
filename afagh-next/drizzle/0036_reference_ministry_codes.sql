-- ════════════════════════════════════════════════════════════════════════
-- 0036 — کدهای ملی/وزارتی جدول‌های مرجع (پیش‌زمینهٔ اتصال ثمین)
-- ────────────────────────────────────────────────────────────────────────
--  standardCode («کد استاندارد») و ministryCode («کد وزارت/وزارت علوم»)
--  به جدول‌های مرجع آموزشی اضافه می‌شوند تا سامانهٔ ثمین ستون کم نداشته باشد.
--  الگوی همان geo_*ها: varchar(50)، nullable، بدون backfill.
--  majors از قبل standardCode (varchar(20)) دارد و فقط ministryCode می‌گیرد.
--  همهٔ دستورها idempotent (IF NOT EXISTS) — اجرای دوباره بی‌خطر است.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE "degree_level_configs" ADD COLUMN IF NOT EXISTS "standardCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "degree_level_configs" ADD COLUMN IF NOT EXISTS "ministryCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "faculties" ADD COLUMN IF NOT EXISTS "standardCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "faculties" ADD COLUMN IF NOT EXISTS "ministryCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "standardCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "ministryCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "ministryCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "standardCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "ministryCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "standardCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "ministryCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "standardCode" varchar(50);
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "ministryCode" varchar(50);
