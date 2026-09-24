-- ═══════════════════════════════════════════════════════════════════
--  جدول آستانه‌های نمره کیفی بر اساس مقطع تحصیلی
--  تبدیل نمره عددی ↔ درجه کیفی (عالی/خیلی خوب/خوب/متوسط/مردود)
-- ═══════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grade_thresholds" (
  "id" serial PRIMARY KEY,
  "degreeLevelId" integer NOT NULL REFERENCES "degree_level_configs"("id"),
  "label" varchar(50) NOT NULL,
  "minValue" numeric(4, 2) NOT NULL,
  "maxValue" numeric(4, 2) NOT NULL,
  "passed" integer NOT NULL DEFAULT 1,
  "sortOrder" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
-- پیش‌نیاز: سطرهای مقطع پایه (id=1 کارشناسی، id=2 کارشناسی‌ارشد) که grade_thresholds
-- با ارجاع سخت‌کد به آن‌ها وابسته است. در نصب تازه، seed-base (گام بعد از مهاجرت‌ها)
-- هنوز اجرا نشده و این جدول خالی است؛ این‌جا فقط همان دو id لازم را می‌سازیم.
-- seed-base بعداً با ON CONFLICT (code) DO UPDATE روی همین ردیف‌ها آپدیت می‌کند،
-- پس idها (که با ترتیب درجِ seed-base یکی‌اند: BS سپس MS) دست‌نخورده می‌مانند.
INSERT INTO "degree_level_configs" (title, code, "defaultPassingGrade", "conditionalGpaThreshold", "maxUnitsPerTerm")
VALUES
  ('کارشناسی پیوسته', 'BS', '10.00', '12.00', 20),
  ('کارشناسی ارشد', 'MS', '12.00', '14.00', 12)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO "grade_thresholds" ("degreeLevelId", "label", "minValue", "maxValue", "passed", "sortOrder") VALUES
  (1, 'عالی',     18.00, 20.00, 1, 1),
  (1, 'خیلی خوب', 16.00, 17.99, 1, 2),
  (1, 'خوب',      14.00, 15.99, 1, 3),
  (1, 'مردود',     0.00, 13.99, 0, 4)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "grade_thresholds" ("degreeLevelId", "label", "minValue", "maxValue", "passed", "sortOrder") VALUES
  (2, 'عالی',     18.00, 20.00, 1, 1),
  (2, 'خیلی خوب', 16.00, 17.99, 1, 2),
  (2, 'خوب',      16.00, 17.99, 1, 3),
  (2, 'مردود',     0.00, 15.99, 0, 4)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "degree_level_configs" ADD COLUMN IF NOT EXISTS "transcriptDisplayMode" varchar(20) DEFAULT 'NUMERIC';
--> statement-breakpoint
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '10.00' WHERE "code" IN ('SAMA-1', 'KARSHENASI', 'KARDANI', 'KARSHENASI_PYVASTEH');
--> statement-breakpoint
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '12.00' WHERE "code" IN ('SAMA-2', 'ARSHAD');
--> statement-breakpoint
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '16.00' WHERE "code" IN ('SAMA-3', 'SAMA-4', 'SAMA-6', 'SAMA-7', 'SAMA-8', 'DOCTORA');
--> statement-breakpoint
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '12.00' WHERE "title" LIKE '%ارشد%' AND "defaultPassingGrade" = '10.00';
--> statement-breakpoint
UPDATE "degree_level_configs" SET "defaultPassingGrade" = '16.00' WHERE ("title" LIKE '%دکترا%' OR "title" LIKE '%دکتری%') AND "defaultPassingGrade" = '10.00';
