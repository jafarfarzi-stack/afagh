-- 0015 — کد وضعیت نمرهٔ سما در enrollment + جدول تاریخچه تغییرات نمره
-- ۱) ستون samaGradeStatusCode در enrollments: کد وضعیت سما هنگام نهایی‌سازی
-- ۲) جدول grade_change_log: ثبت هر تغییر نمره با actor + دلیل

ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "samaGradeStatusCode" varchar(10);

CREATE TABLE IF NOT EXISTS "grade_change_log" (
  "id" serial PRIMARY KEY,
  "enrollmentId" integer NOT NULL REFERENCES "enrollments"("id"),
  "studentId" integer NOT NULL REFERENCES "students"("id"),
  "offeringId" integer NOT NULL REFERENCES "course_offerings"("id"),
  "action" varchar(30) NOT NULL,           -- DRAFT|TEMPORARY|FINALIZED|APPEAL|ADMIN_OVERRIDE
  "oldGradeValue" varchar(20),
  "newGradeValue" varchar(20),
  "oldGradeStatus" varchar(20),
  "newGradeStatus" varchar(20),
  "oldSamaStatusCode" varchar(10),
  "newSamaStatusCode" varchar(10),
  "reason" text,
  "actorUserId" integer REFERENCES "users"("id"),
  "actorRole" varchar(30),                 -- PROFESSOR|ADMIN|GRADUATEAFFAIRS
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_grade_change_log_enrollment" ON "grade_change_log"("enrollmentId");
CREATE INDEX IF NOT EXISTS "idx_grade_change_log_student" ON "grade_change_log"("studentId");
CREATE INDEX IF NOT EXISTS "idx_grade_change_log_created" ON "grade_change_log"("createdAt");
