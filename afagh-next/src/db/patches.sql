CREATE TABLE IF NOT EXISTS api_audit_logs (
  id SERIAL PRIMARY KEY,
  service_name VARCHAR(50),
  endpoint VARCHAR(255),
  request_body TEXT,
  response_body TEXT,
  status_code INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id SERIAL PRIMARY KEY,
  event_code VARCHAR(50),
  title VARCHAR(255),
  channel VARCHAR(50),
  template_text TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "category" varchar(50) DEFAULT 'عمومی';
ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "formSchema" text;
ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "outputTemplate" varchar(50);
ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "feeAmount" integer DEFAULT 0;
ALTER TABLE process_definitions ADD COLUMN IF NOT EXISTS "isActive" integer DEFAULT 1;

ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "timeoutEscalateToRole" varchar(50);
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "slaHours" integer DEFAULT 24;
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "timeoutAction" varchar(50) DEFAULT 'AUTO_ESCALATE';
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "stepOrder" integer DEFAULT 1;
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "stepType" varchar(30) DEFAULT 'APPROVAL';
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "serviceTaskType" varchar(50);
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "autoConditionsJson" text;
ALTER TABLE process_steps ADD COLUMN IF NOT EXISTS "assignedStaffId" integer;

ALTER TABLE educational_regulations ADD COLUMN IF NOT EXISTS "rulesConfig" text DEFAULT '{}';
ALTER TABLE students ADD COLUMN IF NOT EXISTS "quotaType" varchar(50) DEFAULT 'NORMAL';
ALTER TABLE students ADD COLUMN IF NOT EXISTS "extraAllowedSemesters" integer DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS "extraAllowedProbations" integer DEFAULT 0;

-- کش گزارش‌های هوش تجاری (bi-engine)؛ همان تعریف schema.ts، idempotent
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id SERIAL PRIMARY KEY,
  "cacheKey" VARCHAR(160) NOT NULL UNIQUE,
  "reportType" VARCHAR(60) NOT NULL,
  payload TEXT NOT NULL,
  "rowCount" INTEGER,
  "durationMs" INTEGER,
  "computedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP
);

-- ایندکس‌های کوئری‌های تجمیعی BI (بخش ⑦ pg-hardening.sql)
CREATE INDEX IF NOT EXISTS "idx_eval_resp_period_offering" ON evaluation_responses ("periodId", "offeringId");
CREATE INDEX IF NOT EXISTS "idx_eval_resp_question"        ON evaluation_responses ("questionId");
CREATE INDEX IF NOT EXISTS "idx_eval_resp_offering"        ON evaluation_responses ("offeringId");
CREATE INDEX IF NOT EXISTS "idx_eval_q_form_axis"          ON evaluation_questions ("formId", "axisLabel");
CREATE INDEX IF NOT EXISTS "idx_schedules_room_type"       ON schedules ("roomId", "scheduleType");
CREATE INDEX IF NOT EXISTS "idx_offering_prof_role"        ON offering_professors ("role", "staffId");
CREATE INDEX IF NOT EXISTS "idx_analytics_snapshots_type"  ON analytics_snapshots ("reportType");

-- ═══ پچ‌های امنیتی پذیرش (فاز اصلاح) ═══
ALTER TABLE users ADD COLUMN IF NOT EXISTS "mustChangePassword" integer DEFAULT 0;

-- ═══ پچ‌های مهاجرت از دیتابیس قدیمی (رشته‌ها و اساتید) ═══
ALTER TABLE faculties ADD COLUMN IF NOT EXISTS "facultyCode" varchar(10);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS "departmentCode" varchar(10);
ALTER TABLE majors ADD COLUMN IF NOT EXISTS "facultyId" integer;
ALTER TABLE majors ADD COLUMN IF NOT EXISTS "minUnits" integer;
ALTER TABLE majors ADD COLUMN IF NOT EXISTS "standardCode" varchar(20);
ALTER TABLE majors ADD COLUMN IF NOT EXISTS "establishedDate" varchar(10);
ALTER TABLE majors ADD COLUMN IF NOT EXISTS "terminatedDate" varchar(10);
ALTER TABLE majors ADD COLUMN IF NOT EXISTS "isActive" integer DEFAULT 1;
ALTER TABLE majors ADD COLUMN IF NOT EXISTS "headStaffCode" varchar(20);
ALTER TABLE majors ADD COLUMN IF NOT EXISTS "expertName" varchar(150);
ALTER TABLE majors ADD COLUMN IF NOT EXISTS "lastCouncilDate" varchar(10);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "title" varchar(50);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "facultyId" integer;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "isActive" integer DEFAULT 1;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "cooperationType" varchar(50);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "personnelNo" varchar(50);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "employmentType" varchar(50);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "hireDate" varchar(10);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "lastDegreeYear" integer;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "fieldOfStudy" varchar(200);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "maritalStatusCode" integer;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "maritalStatus" varchar(20);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "lastDegreeCountryCode" varchar(10);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "lastDegreeUniversity" varchar(200);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "academicBase" varchar(20);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "birthProvince" varchar(100);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "birthCity" varchar(100);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "bankAccountNo" varchar(50);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "phone" varchar(20);
-- قید یکتایی فرمول شمارهٔ دانشجویی (پایهٔ افزایش اتمیک + onConflictDoNothing).
-- اگر ردیف تکراری قدیمی وجود داشته باشد، به‌جای شکستن استارت‌آپ،
-- ایندکس ساخته نشده و در لاگ هشدار داده می‌شود.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_id_formulas_degreeLevelId_unique') THEN
    IF (SELECT COUNT(*) FROM (
          SELECT "degreeLevelId" FROM student_id_formulas
          WHERE "degreeLevelId" IS NOT NULL GROUP BY "degreeLevelId" HAVING COUNT(*) > 1) d) = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS "student_id_formulas_degreeLevelId_unique"
        ON student_id_formulas ("degreeLevelId");
    ELSE
      RAISE WARNING 'student_id_formulas دارای ردیف تکراری degreeLevelId است — قید یکتایی ساخته نشد';
    END IF;
  END IF;
END $$;

-- M-4: ایندکس‌های پاکسازی/چرخش نشست‌ها (در drizzle push برای نصب‌های قدیمی ساخته نمی‌شود)
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON sessions ("userId");
CREATE INDEX IF NOT EXISTS "sessions_expiresAt_idx" ON sessions ("expiresAt");
