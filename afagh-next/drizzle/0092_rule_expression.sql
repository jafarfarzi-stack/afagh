-- ══════════════════════════════════════════════════════════════════════
-- 0092 — عبارت فرمول یکپارچه روی سطر قانون (الگوریتم ساده‌شده)
--
-- نسخهٔ قدیمی: فرمول‌ها عبارت ریاضی با متغیرهای N/A/W/U/C بودند
-- (مثل کارآموزی: (5.0+U*C*1.0)/(12.0)) + R نرخ + K ضریب جمعی + F/H.
-- به‌جای ۳ ستون جدا (multiplierUnit/multiplierPerStudent/flatFee) یک ستون
-- expression؛ سه ستون قدیمی پس از بک‌فیل حذف می‌شوند.
-- ابعاد جدید سطر: departmentId (گروه آموزشی)، courseType (نوع دقیق درس)،
-- repeatNumber (دفعهٔ Nام تدریس؛ NULL = همه).
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "expression" TEXT;

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "departmentId" INTEGER REFERENCES "departments"("id");

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "courseType" VARCHAR(50);

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "repeatNumber" INTEGER;

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "flatBase" NUMERIC(12, 0);

-- بک‌فیل: سطرهای موجود به عبارت معادل تبدیل می‌شوند (خروجی ریال)
--> statement-breakpoint
UPDATE "payroll_calculation_rules"
SET "expression" =
  CASE
    WHEN "flatFee" IS NOT NULL THEN "flatFee"::text || '*C'
    WHEN "multiplierPerStudent" IS NOT NULL
      THEN 'R*U*C*' || "multiplierPerStudent"::text
    ELSE 'R*U*' || COALESCE("multiplierUnit"::text, '1')
  END
WHERE "expression" IS NULL;

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" DROP COLUMN IF EXISTS "multiplierUnit";

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" DROP COLUMN IF EXISTS "multiplierPerStudent";

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" DROP COLUMN IF EXISTS "flatFee";

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payroll_rules_match" ON "payroll_calculation_rules" ("offeringType", "professorRole", "academicRank", "classMode");
