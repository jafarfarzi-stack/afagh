-- 0009 تعداد ترم چارت + پرچم تکمیلی برای مقاطع (feat 60c71e4: کد بدون مایگریشن push شده بود و overview می‌ترکید)
ALTER TABLE "degree_level_configs" ADD COLUMN IF NOT EXISTS "termCount" integer;
ALTER TABLE "degree_level_configs" ADD COLUMN IF NOT EXISTS "isGraduate" integer;
-- بک‌فیل فقط برای NULLها (مقادیر دستی کاربر دست‌نخورده می‌ماند) — هم‌ارز DEGREE_CHART_DEFAULTS در seed-base
UPDATE "degree_level_configs" SET "termCount" = CASE "code" WHEN 'BS' THEN 8 WHEN 'MS' THEN 4 WHEN 'AD' THEN 4 WHEN 'PHD' THEN 4 ELSE 8 END WHERE "termCount" IS NULL;
UPDATE "degree_level_configs" SET "isGraduate" = CASE "code" WHEN 'MS' THEN 1 WHEN 'PHD' THEN 1 ELSE 0 END WHERE "isGraduate" IS NULL;
