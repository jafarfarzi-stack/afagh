-- ══════════════════════════════════════════════════════════════════════
-- 0034 — اضافه کردن ستون graduateDegreeLevelId به جدول students
-- مقطع فارغ‌التحصیلی (ممکن است با مقطع ورود متفاوت باشد، مثل انصراف از کارشناسی به کاردانی)
-- ═══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "graduateDegreeLevelId" integer;

--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "students" ADD CONSTRAINT "students_graduateDegreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("graduateDegreeLevelId") REFERENCES "degree_level_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Backfill: پیش‌فرض مقطع ورود (برای داده‌های قدیمی که مقطع فارغ‌التحصیلی ثبت نشده)
UPDATE "students" SET "graduateDegreeLevelId" = "degreeLevelId" WHERE "graduateDegreeLevelId" IS NULL AND "degreeLevelId" IS NOT NULL;