-- ══════════════════════════════════════════════════════════════════════
-- 0087 — اقلام تکمیلی حقوق: استثناهای ارائه، فعالیت‌ها، کمک‌هزینه، نقدی، مبنای حکم
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offering_payroll_extras" (
  "id" SERIAL PRIMARY KEY,
  "offeringId" INTEGER NOT NULL REFERENCES "course_offerings"("id"),
  "staffId" INTEGER NOT NULL REFERENCES "staff"("id"),
  "extraUnits" NUMERIC(5,2) NOT NULL DEFAULT '0',
  "flatAmount" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_extras_offering_staff" ON "offering_payroll_extras" ("offeringId", "staffId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qualitative_activity_types" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "scoreUnit" TEXT NOT NULL DEFAULT 'HOUR',
  "quantFactor" NUMERIC(8,4) NOT NULL DEFAULT '1',
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_activity_entries" (
  "id" SERIAL PRIMARY KEY,
  "staffId" INTEGER NOT NULL REFERENCES "staff"("id"),
  "termId" INTEGER NOT NULL REFERENCES "academic_terms"("id"),
  "activityTypeId" INTEGER NOT NULL REFERENCES "qualitative_activity_types"("id"),
  "quantity" NUMERIC(8,2) NOT NULL DEFAULT '0',
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decidedBy" INTEGER REFERENCES "users"("id"),
  "decidedAt" TIMESTAMP,
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_entries_staff_term" ON "staff_activity_entries" ("staffId", "termId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_allowance_items" (
  "id" SERIAL PRIMARY KEY,
  "statementId" INTEGER NOT NULL REFERENCES "payroll_statements"("id"),
  "title" TEXT NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "kind" TEXT NOT NULL DEFAULT 'ALLOWANCE',
  "createdBy" INTEGER REFERENCES "users"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_cash_extras" (
  "id" SERIAL PRIMARY KEY,
  "staffId" INTEGER NOT NULL REFERENCES "staff"("id"),
  "termId" INTEGER NOT NULL REFERENCES "academic_terms"("id"),
  "title" TEXT NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_extras_staff_term" ON "payroll_cash_extras" ("staffId", "termId");

--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "isVeteran" INTEGER NOT NULL DEFAULT 0;

--> statement-breakpoint
ALTER TABLE "professor_term_contracts" ADD COLUMN IF NOT EXISTS "salaryBase" INTEGER;

--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD COLUMN IF NOT EXISTS "activityPay" INTEGER NOT NULL DEFAULT 0;

--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD COLUMN IF NOT EXISTS "allowancePay" INTEGER NOT NULL DEFAULT 0;

--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD COLUMN IF NOT EXISTS "examPay" INTEGER NOT NULL DEFAULT 0;

--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD COLUMN IF NOT EXISTS "cashExtraPay" INTEGER NOT NULL DEFAULT 0;

--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD COLUMN IF NOT EXISTS "decreeId" INTEGER REFERENCES "teaching_decrees"("id");
