-- ══════════════════════════════════════════════════════════════════════
-- 0078 — جدول تأییدیهٔ انتخاب واحد انگلیسی (ماژول الحاقی)
--
-- فایل الحاقی؛ هیچ جدول موجودی تغییر نمی‌کند. idempotent: همهٔ آبجکت‌ها با
-- IF NOT EXISTS. چرخه: PENDING → APPROVED | REJECTED
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "english_enrollment_approvals" (
  "id" SERIAL PRIMARY KEY,
  "studentId" INTEGER NOT NULL REFERENCES "students"("id"),
  "offeringId" INTEGER NOT NULL REFERENCES "course_offerings"("id"),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedBy" INTEGER REFERENCES "users"("id"),
  "decidedBy" INTEGER REFERENCES "users"("id"),
  "decidedAt" TIMESTAMP,
  "note" TEXT,
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_english_enroll_approvals_status" ON "english_enrollment_approvals" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_english_enroll_approvals_student_offering" ON "english_enrollment_approvals" ("studentId", "offeringId");
