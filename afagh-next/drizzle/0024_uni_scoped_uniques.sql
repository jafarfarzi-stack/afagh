-- ══════════════════════════════════════════════════════════════════════
-- 0024 — یکتایی در سطح دانشگاه (نه سراسری): studentCode/courseCode/staffCode
-- ────────────────────────────────────────────────────────────────────────
--  سما هر دانشگاه شماره‌گذاری جدا دارد (مثلاً 9012234100 در دو دانشگاه،
--  یا کد درس 23087 در آفاق و علامه). یونیک سراسری باعث drop ساکت رکوردهای
--  دانشگاه‌های بعدی می‌شد (زرینه: 461 دانشجو گم شد!).
--  راه‌حل: UNIQUE کامپوزیت (universityId, code).
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_studentCode_unique";
--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_studentcode_unique";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "students" ADD CONSTRAINT "uq_students_uni_code" UNIQUE ("universityId","studentCode");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_code_unique";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_uni_code" UNIQUE ("universityId","code");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_staffCode_unique";
--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_staffcode_unique";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "staff" ADD CONSTRAINT "uq_staff_uni_code" UNIQUE ("universityId","staffCode");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
