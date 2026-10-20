-- ۰۱۰۹: درخواست اخذ درس بدون رعایت پیش‌نیاز / با تداخل امتحانی + مهلت‌های تعریف نیمسال
-- idempotent: اجرای چندباره بی‌خطر است.

-- ۱) مهلت‌های تصمیم‌گیری روی تعریف نیمسال
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "bypassManagerHours" integer DEFAULT 48;
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "bypassExpertHours" integer DEFAULT 12;
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "bypassReminderHours" integer DEFAULT 10;

-- ۲) جدول درخواست‌ها
CREATE TABLE IF NOT EXISTS "enroll_bypass_requests" (
  "id" serial PRIMARY KEY,
  "studentId" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "offeringId" integer NOT NULL REFERENCES "course_offerings"("id") ON DELETE CASCADE,
  "termId" integer NOT NULL REFERENCES "academic_terms"("id") ON DELETE CASCADE,
  "universityId" integer REFERENCES "universities"("id"),
  "kind" varchar(20) NOT NULL,                 -- PREREQ | EXAM_CONFLICT
  "status" varchar(30) NOT NULL DEFAULT 'PENDING_MANAGER',
  "reasonCode" varchar(40),
  "reasonText" text,
  "decidedRole" varchar(20),                   -- MANAGER | EXPERT | VICE | SYSTEM
  "decidedByUserId" integer REFERENCES "users"("id"),
  "decidedAt" timestamp,
  "managerDeadlineAt" timestamp NOT NULL,
  "expertDeadlineAt" timestamp,
  "escalatedAt" timestamp,
  "managerReminderAt" timestamp,
  "expertReminderAt" timestamp,
  "studentWarnedAt" timestamp,
  "seatReserved" integer NOT NULL DEFAULT 1,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_bypass_student" ON "enroll_bypass_requests" ("studentId");
CREATE INDEX IF NOT EXISTS "idx_bypass_offering_status" ON "enroll_bypass_requests" ("offeringId", "status");
CREATE INDEX IF NOT EXISTS "idx_bypass_status_deadline" ON "enroll_bypass_requests" ("status", "managerDeadlineAt");
CREATE INDEX IF NOT EXISTS "idx_bypass_term" ON "enroll_bypass_requests" ("termId");

-- ۳) حداکثر یک درخواست باز برای هر (دانشجو، درس‌ارائه، نوع)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bypass_open_request"
  ON "enroll_bypass_requests" ("studentId", "offeringId", "kind")
  WHERE "status" IN ('PENDING_MANAGER', 'ESCALATED_EXPERT');
