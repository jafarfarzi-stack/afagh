-- ══════════════════════════════════════════════════════════════════════
-- 0084 — ابلاغ آموزشی با شمارهٔ دبیرخانهٔ پیاپی (ماژول الحاقی حق‌التدریس)
-- فایل الحاقی؛ هیچ جدول موجودی تغییر نمی‌کند. idempotent (IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decree_counters" (
  "universityId" INTEGER NOT NULL REFERENCES "universities"("id") UNIQUE,
  "lastNo" INTEGER NOT NULL DEFAULT 0
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teaching_decrees" (
  "id" SERIAL PRIMARY KEY,
  "staffId" INTEGER NOT NULL REFERENCES "staff"("id"),
  "termId" INTEGER NOT NULL REFERENCES "academic_terms"("id"),
  "secretariatNo" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  "snapshotJson" TEXT,
  "signersJson" TEXT,
  "issuedBy" INTEGER REFERENCES "users"("id"),
  "issuedAt" TIMESTAMP,
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decree_items" (
  "id" SERIAL PRIMARY KEY,
  "decreeId" INTEGER NOT NULL REFERENCES "teaching_decrees"("id") ON DELETE CASCADE,
  "section" VARCHAR(20) NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "units" NUMERIC(6, 2),
  "amount" NUMERIC(12, 0),
  "metaJson" TEXT
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_decrees_uni_no" ON "teaching_decrees" ("universityId", "secretariatNo");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_decrees_staff_term" ON "teaching_decrees" ("staffId", "termId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_decree_items_decree" ON "decree_items" ("decreeId");
