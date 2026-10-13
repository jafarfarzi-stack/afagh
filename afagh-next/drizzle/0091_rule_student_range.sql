-- ══════════════════════════════════════════════════════════════════════
-- 0091 — بازه دانشجو + فرمول ساعتی روی سطر قانون (الگوریتم یکپارچه)
--
-- به‌جای جدول جداگانهٔ «پله نقش»، بازهٔ دانشجویی و فرمول ساعتی مستقیم روی
-- خود سطر قانون می‌نشیند؛ هر ترکیب (نقش × بازه) یک سطر مستقل با فرمول خودش:
--   ۱۰+ → واحدی ×۱ (کامل) | ۵ تا ۹ → واحدی ×۰٫۵ (نصف) | زیر ۵ → ساعتی ۲h
-- NULL یعنی «بدون قید» (سازگار با قوانین موجود).
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "minStudents" INTEGER;

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "maxStudents" INTEGER;

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "perStudentHours" NUMERIC(5, 2);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payroll_rules_student_range" ON "payroll_calculation_rules" ("minStudents", "maxStudents");
