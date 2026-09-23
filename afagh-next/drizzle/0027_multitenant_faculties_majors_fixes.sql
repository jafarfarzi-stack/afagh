-- ══════════════════════════════════════════════════════════════════════
-- 0027 — چنددانشگاهی: رفع تداخل یکتایی faculties, departments, majors, degree_level_configs
-- ────────────────────────────────────────────────────────────────────────
--  1. افزودن universityId به degree_level_configs مطابق با schema.ts
--  2. اصلاح قیود یکتایی faculties (اسکوپ شده به universityId + facultyCode)
--  3. اصلاح قیود یکتایی departments (اسکوپ شده به universityId + departmentCode)
--  4. اصلاح قیود یکتایی majors (اسکوپ شده به universityId + majorCode)
--  5. حذف مجدد students_userId_unique جهت امکان تحصیل همزمان یا در چند مقطع
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "degree_level_configs" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "degree_level_configs" ADD CONSTRAINT "degree_level_configs_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "degree_level_configs" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "faculties" DROP CONSTRAINT IF EXISTS "faculties_facultycode_unique";
--> statement-breakpoint
ALTER TABLE "faculties" DROP CONSTRAINT IF EXISTS "faculties_facultyCode_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "faculties_facultyCode_uq";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "faculties" ADD CONSTRAINT "uq_faculties_uni_code" UNIQUE ("universityId","facultyCode");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
DROP INDEX IF EXISTS "departments_departmentCode_uq";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "departments" ADD CONSTRAINT "uq_departments_uni_code" UNIQUE ("universityId","departmentCode");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
ALTER TABLE "majors" DROP CONSTRAINT IF EXISTS "majors_majorcode_unique";
--> statement-breakpoint
ALTER TABLE "majors" DROP CONSTRAINT IF EXISTS "majors_majorCode_unique";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "majors" ADD CONSTRAINT "uq_majors_uni_code" UNIQUE ("universityId","majorCode");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_userId_unique";
