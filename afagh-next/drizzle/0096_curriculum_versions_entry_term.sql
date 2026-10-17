-- 0096 — نیمسال ورودِ نسخهٔ برنامهٔ درسی (`curriculum_versions.entryTermId`)
--
-- نگاشت «درس → نیمسال ورود» برای نمودارهای برنامهٔ درسی و مهاجرت.
-- NULL یعنی محدودیتی ندارد (همهٔ ورودی‌ها).
--
-- ⚠️ این فایل پیش‌تر بدون رکورد در `meta/_journal.json` کامیت شده بود و به همین
-- دلیل هیچ‌وقت اجرا نشد؛ الان هم به ژورنال اضافه شده و هم idempotent شده است.

--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN IF NOT EXISTS "entryTermId" integer;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'curriculum_versions_entryTermId_fkey'
  ) THEN
    ALTER TABLE "curriculum_versions"
      ADD CONSTRAINT "curriculum_versions_entryTermId_fkey"
      FOREIGN KEY ("entryTermId") REFERENCES "financial_terms"("id");
  END IF;
END $$;
