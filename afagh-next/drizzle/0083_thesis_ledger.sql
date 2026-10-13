-- ══════════════════════════════════════════════════════════════════════
-- 0083 — دفتر «واحد باقی‌مانده» پایان‌نامه (ماژول الحاقی حق‌التدریس)
-- فایل الحاقی؛ هیچ جدول موجودی تغییر نمی‌کند. idempotent (IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thesis_supervisions" (
  "id" SERIAL PRIMARY KEY,
  "staffId" INTEGER NOT NULL REFERENCES "staff"("id"),
  "studentId" INTEGER REFERENCES "students"("id"),
  "studentNameManual" VARCHAR(150),
  "title" VARCHAR(300) NOT NULL,
  "totalUnits" NUMERIC(4, 2) NOT NULL DEFAULT '6',
  "role" VARCHAR(20) NOT NULL DEFAULT 'SUPERVISOR',
  "status" VARCHAR(20) NOT NULL DEFAULT 'ONGOING',
  "thesisProgressId" INTEGER,
  "startTermId" INTEGER REFERENCES "academic_terms"("id"),
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thesis_unit_draws" (
  "id" SERIAL PRIMARY KEY,
  "supervisionId" INTEGER NOT NULL REFERENCES "thesis_supervisions"("id") ON DELETE CASCADE,
  "termId" INTEGER NOT NULL REFERENCES "academic_terms"("id"),
  "units" NUMERIC(4, 2) NOT NULL,
  "note" VARCHAR(300),
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thesis_sup_staff" ON "thesis_supervisions" ("staffId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thesis_draws_sup" ON "thesis_unit_draws" ("supervisionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thesis_draws_term" ON "thesis_unit_draws" ("termId");
