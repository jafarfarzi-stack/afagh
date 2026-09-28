-- ═══════════════════════════════════════════════════════════════════════
-- 0033 — اضافه کردن ستون entryDate به جدول students
-- تاریخ دقیق شروع تحصیل (روز/ماه/سال) برای نمایش در کارنامه/گواهینامه
-- ═══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "entryDate" date;

-- Backfill entryDate for existing students from entryYear/entryTerm
-- Since we only have year/term, approximate to first day of term
-- ترم ۱ = اول مهر (07/01)، ترم ۲ = اول بهمن (11/01)
UPDATE "students" 
SET "entryDate" = 
  CASE 
    WHEN "entryTerm" = 1 THEN make_date("entryYear", 7, 1)
    WHEN "entryTerm" = 2 THEN make_date("entryYear", 11, 1)
    ELSE make_date("entryYear", 7, 1)
  END
WHERE "entryDate" IS NULL 
  AND "entryYear" IS NOT NULL 
  AND "entryYear" > 0
  AND "entryTerm" IS NOT NULL;