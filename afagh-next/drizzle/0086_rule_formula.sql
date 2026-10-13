-- ══════════════════════════════════════════════════════════════════════
-- 0086 — ابعاد جدید فرمول حق‌التدریس: تکرار، دوری، پنجره (additive)
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "teaching_rules" ADD COLUMN IF NOT EXISTS "repeatPolicy" TEXT DEFAULT 'ALLOW';

--> statement-breakpoint
ALTER TABLE "teaching_rules" ADD COLUMN IF NOT EXISTS "distanceScope" TEXT DEFAULT 'ALL';

--> statement-breakpoint
ALTER TABLE "teaching_rules" ADD COLUMN IF NOT EXISTS "repeatCourseWindow" INTEGER;

--> statement-breakpoint
ALTER TABLE "teaching_rules" ADD COLUMN IF NOT EXISTS "termCountWindow" INTEGER;

--> statement-breakpoint
ALTER TABLE "teaching_rules" ADD COLUMN IF NOT EXISTS "excludeTerms" TEXT;

--> statement-breakpoint
ALTER TABLE "teaching_coefficients" ADD COLUMN IF NOT EXISTS "minStudents" INTEGER;

--> statement-breakpoint
ALTER TABLE "teaching_coefficients" ADD COLUMN IF NOT EXISTS "stepSize" INTEGER;

--> statement-breakpoint
ALTER TABLE "teaching_coefficients" ADD COLUMN IF NOT EXISTS "stepIncrement" NUMERIC(6,4);

--> statement-breakpoint
ALTER TABLE "teaching_coefficients" ADD COLUMN IF NOT EXISTS "capUnits" NUMERIC(6,2);
