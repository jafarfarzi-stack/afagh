-- ═══════════════════════════════════════════════════════════════════
--  جدول آستانه‌های نمره کیفی بر اساس مقطع تحصیلی
--  تبدیل نمره عددی ↔ درجه کیفی (عالی/خیلی خوب/خوب/متوسط/مردود)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "grade_thresholds" (
  "id" serial PRIMARY KEY,
  "degreeLevelId" integer NOT NULL REFERENCES "degree_level_configs"("id"),
  "label" varchar(50) NOT NULL,
  "minValue" numeric(4, 2) NOT NULL,
  "maxValue" numeric(4, 2) NOT NULL,
  "passed" integer NOT NULL DEFAULT 1,
  "sortOrder" integer NOT NULL DEFAULT 0
);

-- آستانه‌های پیش‌فرض کارشناسی ارشد (ماده ۳۶ آیین‌نامه)
INSERT INTO "grade_thresholds" ("degreeLevelId", "label", "minValue", "maxValue", "passed", "sortOrder") VALUES
  (1, 'عالی',     18.00, 20.00, 1, 1),
  (1, 'خیلی خوب', 16.00, 17.99, 1, 2),
  (1, 'خوب',      14.00, 15.99, 1, 3),
  (1, 'مردود',     0.00, 13.99, 0, 4);

-- آستانه‌های پیش‌فرض دکتری (ماده ۴۸ آیین‌نامه)
INSERT INTO "grade_thresholds" ("degreeLevelId", "label", "minValue", "maxValue", "passed", "sortOrder") VALUES
  (2, 'عالی',     18.00, 20.00, 1, 1),
  (2, 'خیلی خوب', 16.00, 17.99, 1, 2),
  (2, 'خوب',      16.00, 17.99, 1, 3),
  (2, 'مردود',     0.00, 15.99, 0, 4);

-- حالت نمایش کارنامه
ALTER TABLE "degree_level_configs" ADD COLUMN IF NOT EXISTS "transcriptDisplayMode" varchar(20) DEFAULT 'NUMERIC';
-- مقادیر: NUMERIC (فقط عدد), QUALITATIVE (فقط کیفی), BOTH (هر دو)

-- پیش‌فرض حداقل نمره قبولی بر اساس مقطع
-- کاردانی/کارشناسی: ۱۰ | ارشد: ۱۲ | دکتری: ۱۶
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '10.00' WHERE "code" IN ('SAMA-1', 'KARSHENASI', 'KARDANI', 'KARSHENASI_PYVASTEH');
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '12.00' WHERE "code" IN ('SAMA-2', 'ARSHAD');
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '16.00' WHERE "code" IN ('SAMA-3', 'SAMA-4', 'SAMA-6', 'SAMA-7', 'SAMA-8', 'DOCTORA');
-- اگر کد خاصی نداشت، بر اساس عنوان
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '12.00' WHERE "title" LIKE '%ارشد%' AND "defaultPassingGrade" = '10.00';
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '16.00' WHERE ("title" LIKE '%دکترا%' OR "title" LIKE '%دکتری%') AND "defaultPassingGrade" = '10.00';
