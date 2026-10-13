-- ══════════════════════════════════════════════════════════════════════
-- 0088 — پرداخت امتحانی + اعتراض استاد به کارنامه حقوقی (additive)
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_payments" (
  "id" SERIAL PRIMARY KEY,
  "staffId" INTEGER NOT NULL REFERENCES "staff"("id"),
  "termId" INTEGER NOT NULL REFERENCES "academic_terms"("id"),
  "source" TEXT NOT NULL DEFAULT 'INVIGILATION',
  "sessionCount" INTEGER NOT NULL DEFAULT 0,
  "unitCount" NUMERIC(8,2) NOT NULL DEFAULT '0',
  "amount" INTEGER NOT NULL DEFAULT 0,
  "decreeId" INTEGER REFERENCES "teaching_decrees"("id"),
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exam_payments_staff_term" ON "exam_payments" ("staffId", "termId");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_objections" (
  "id" SERIAL PRIMARY KEY,
  "statementId" INTEGER NOT NULL REFERENCES "payroll_statements"("id"),
  "staffId" INTEGER NOT NULL REFERENCES "staff"("id"),
  "termId" INTEGER NOT NULL REFERENCES "academic_terms"("id"),
  "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reviewNote" TEXT,
  "reviewedBy" INTEGER REFERENCES "users"("id"),
  "reviewedAt" TIMESTAMP,
  "reopenedStatement" INTEGER NOT NULL DEFAULT 0,
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payroll_objections_statement" ON "payroll_objections" ("statementId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payroll_objections_staff_term" ON "payroll_objections" ("staffId", "termId");
