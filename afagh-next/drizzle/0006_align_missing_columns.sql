-- 0006 — هم‌راستاسازی DB زنده با schema.ts (ستون‌های مایگریشن 0000 که روی DB اعمال نشده بود)
-- academic_terms.termType
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "termType" varchar(20) NOT NULL DEFAULT 'NORMAL';
-- faculties.facultyCode
ALTER TABLE "faculties" ADD COLUMN IF NOT EXISTS "facultyCode" varchar(10);
-- departments.departmentCode
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "departmentCode" varchar(10);
-- majors تکمیلی
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "facultyId" integer;
DO $$ BEGIN
  ALTER TABLE "majors" ADD CONSTRAINT "majors_facultyId_faculties_id_fk" FOREIGN KEY ("facultyId") REFERENCES "faculties"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "minUnits" integer;
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "standardCode" varchar(20);
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "establishedDate" varchar(10);
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "terminatedDate" varchar(10);
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "isActive" integer DEFAULT 1;
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "headStaffCode" varchar(20);
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "expertName" varchar(150);
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "lastCouncilDate" varchar(10);
-- users شناسنامه‌ای (موتور مهاجرت و ثمین از قبل به این ستون‌ها ارجاع می‌دهند)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthCertNo" varchar(20);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthCertSeries" varchar(30);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "placeOfBirth" varchar(150);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "placeOfIssue" varchar(150);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthDate" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fatherName" varchar(100);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" varchar(10);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address" varchar(300);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mustChangePassword" integer DEFAULT 0;
