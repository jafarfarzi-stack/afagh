-- ══════════════════════════════════════════════════════════════════════
-- 0072 — درخواست بازگشایی نمرات نهایی‌شده (دو مرحله‌ای)
--
-- استاد (اشتباه در نهایی‌سازی) → درخواست PENDING با دلیل →
-- مرحلهٔ ۱: ADMIN/GRADUATEAFFAIRS به REVIEWED یا REJECTED →
-- مرحلهٔ ۲: VICE_EDU (معاون آموزشی) به APPROVED یا REJECTED.
-- با APPROVED: course_offerings.gradesFinalizedAt=NULL و نمرات به TEMPORARY
-- برمی‌گردند + لاگ UNFINALIZE. مهلت‌ها صرفاً نمایشی‌اند (بدون گیت سخت).
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grade_unfinalize_requests" (
  "id" serial PRIMARY KEY,
  "offeringId" integer NOT NULL REFERENCES "course_offerings"("id"),
  "requestedByUserId" integer NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" integer REFERENCES "users"("id"),
  "reviewNote" text,
  "createdAt" timestamp DEFAULT now(),
  "reviewedAt" timestamp,
  "universityId" integer REFERENCES "universities"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_unfinalize_offering" ON "grade_unfinalize_requests" ("offeringId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_unfinalize_status" ON "grade_unfinalize_requests" ("status");
--> statement-breakpoint
ALTER TABLE "offering_professors" ADD COLUMN IF NOT EXISTS "assignedAt" timestamp DEFAULT now();
