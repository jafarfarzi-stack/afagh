-- ════════════════════════════════════════════════════════════════════════
-- 0016 — چنددانشگاهی: اضافه‌کردن universityId به جداول اصلی
-- ────────────────────────────────────────────────────────────────────────
--  ▸ users       — هر کاربر (استاد/کارمند/دانشجو) به یک دانشگاه تعلق دارد
--  ▸ staff       — هر پروندهٔ کارمندی/هیئت‌علمی به یک دانشگاه
--  ▸ departments — هر گروه آموزشی در یک دانشگاه
--  ▸ courses     — هر درس در یک دانشگاه
--  ▸ data backfill — رکوردهای موجود → AFAGH (دانشگاه خودمان)
--
--  ▸ نسخه‌دار: هیچ‌چیز به patches.sql نمی‌رود.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "users" ADD CONSTRAINT "users_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "staff" ADD CONSTRAINT "staff_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "departments" ADD CONSTRAINT "departments_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "courses" ADD CONSTRAINT "courses_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ── backfill: رکوردهای موجود → AFAGH ──
-- (ستون students از 0005 آمده؛ این خط فقط برای امنیت اگر 0005 ناقص اعمال شده باشد)
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
UPDATE "users" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;
--> statement-breakpoint
UPDATE "staff" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;
--> statement-breakpoint
UPDATE "departments" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;
--> statement-breakpoint
UPDATE "courses" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;
--> statement-breakpoint
UPDATE "students" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;
