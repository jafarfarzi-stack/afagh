-- ══════════════════════════════════════════════════════════════════════
-- 0085 — نسخه‌بندی آیین‌نامهٔ حق‌التدریس + هفتهٔ ترم
-- جدول جدید + ستون‌های الحاقی NULLپذیر (بدون backfill؛ NULL = سراسری/قدیمی).
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_regulation_versions" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(30) NOT NULL,
  "title" VARCHAR(150) NOT NULL,
  "year" INTEGER,
  "description" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_regver_uni_code" ON "payroll_regulation_versions" ("universityId", "code");

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "versionId" INTEGER REFERENCES "payroll_regulation_versions"("id");
--> statement-breakpoint
ALTER TABLE "teaching_coefficients" ADD COLUMN IF NOT EXISTS "versionId" INTEGER REFERENCES "payroll_regulation_versions"("id");
--> statement-breakpoint
ALTER TABLE "teaching_rates" ADD COLUMN IF NOT EXISTS "versionId" INTEGER REFERENCES "payroll_regulation_versions"("id");
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "regulationVersionId" INTEGER REFERENCES "payroll_regulation_versions"("id");
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "weeksCount" INTEGER;
