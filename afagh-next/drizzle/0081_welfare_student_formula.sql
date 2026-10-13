-- ══════════════════════════════════════════════════════════════════════
-- 0081 — صندوق رفاه + فرمول ویژهٔ شهریهٔ یک دانشجو (ماژول الحاقی)
--
-- فایل الحاقی؛ هیچ جدول موجودی تغییر نمی‌کند جز افزودن ستون اختیاری
-- welfareFundId به student_loans. idempotent: همهٔ آبجکت‌ها با IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "welfare_funds" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(40) NOT NULL UNIQUE,
  "title" VARCHAR(150) NOT NULL,
  "description" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_tuition_overrides" (
  "id" SERIAL PRIMARY KEY,
  "studentId" INTEGER NOT NULL REFERENCES "students"("id"),
  "termId" INTEGER REFERENCES "academic_terms"("id"),
  "fixedAmount" NUMERIC(12, 0) NOT NULL DEFAULT '0',
  "perUnitAmount" NUMERIC(12, 0) NOT NULL DEFAULT '0',
  "reason" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
ALTER TABLE "student_loans" ADD COLUMN IF NOT EXISTS "welfareFundId" INTEGER REFERENCES "welfare_funds"("id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_welfare_funds_active" ON "welfare_funds" ("isActive");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tuition_overrides_student" ON "student_tuition_overrides" ("studentId", "isActive");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tuition_overrides_term" ON "student_tuition_overrides" ("termId", "isActive");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_loans_fund" ON "student_loans" ("welfareFundId");

-- صندوق پیش‌فرض (idempotent)
--> statement-breakpoint
INSERT INTO "welfare_funds" ("code", "title", "description", "isActive")
VALUES ('WELFARE_MAIN', 'صندوق رفاه دانشجویان', 'صندوق اصلی رفاه دانشجویی', 1)
ON CONFLICT ("code") DO NOTHING;
