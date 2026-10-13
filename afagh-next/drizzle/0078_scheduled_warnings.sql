-- ══════════════════════════════════════════════════════════════════════
-- 0077 — جدول هشدارهای زمان‌بندی‌شدهٔ دانشجو (ماژول الحاقی)
--
-- فایل الحاقی؛ هیچ جدول موجودی تغییر نمی‌کند. idempotent: همهٔ آبجکت‌ها با
-- IF NOT EXISTS. اجرا توسط runPendingWarnings() از طریق کرون.
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_warnings" (
  "id" SERIAL PRIMARY KEY,
  "studentId" INTEGER NOT NULL REFERENCES "students"("id"),
  "warningType" TEXT,
  "title" TEXT,
  "message" TEXT,
  "sendAt" TIMESTAMP NOT NULL,
  "sentAt" TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdBy" INTEGER REFERENCES "users"("id"),
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_warnings_due" ON "scheduled_warnings" ("status", "sendAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_warnings_student" ON "scheduled_warnings" ("studentId");
