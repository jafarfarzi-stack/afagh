-- ══════════════════════════════════════════════════════════════════════
-- 0076 — جدول سکونت خوابگاه (ماژول الحاقی «کارت سکونت خوابگاه»)
--
-- فایل الحاقی؛ هیچ جدول موجودی تغییر نمی‌کند. idempotent: همهٔ آبجکت‌ها با
-- IF NOT EXISTS. نام ستون‌ها هم‌راستا با اسکیما camelCase.
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dorm_residences" (
  "id" SERIAL PRIMARY KEY,
  "studentId" INTEGER NOT NULL REFERENCES "students"("id"),
  "dormName" TEXT,
  "roomNo" TEXT,
  "bedNo" TEXT,
  "academicYear" TEXT,
  "validFrom" TIMESTAMP,
  "validTo" TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'active',
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dorm_residences_student" ON "dorm_residences" ("studentId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dorm_residences_status" ON "dorm_residences" ("status");
