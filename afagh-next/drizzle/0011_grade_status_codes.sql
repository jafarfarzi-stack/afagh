-- 0011 مرجع کدهای وضعیت نمره (Master Data) + اتصال کد وضعیت به رکورد نمره
CREATE TABLE IF NOT EXISTS "grade_status_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" varchar(12) NOT NULL,
  "title" varchar(200) NOT NULL,
  "legacyCode" varchar(12),
  "internalStatus" varchar(20) NOT NULL,
  "description" text,
  "legacyFlags" text,
  "origin" varchar(10) DEFAULT 'LEGACY' NOT NULL,
  "isActive" integer DEFAULT 1 NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now(),
  CONSTRAINT "uq_grade_status_codes" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "grade_status_codes" ADD COLUMN IF NOT EXISTS "legacyFlags" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_status_codes_internal_idx" ON "grade_status_codes" ("internalStatus");
--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "gradeStatusCodeId" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_gradeStatusCodeId_idx" ON "enrollments" ("gradeStatusCodeId");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_gradeStatusCodeId_fkey') THEN
    ALTER TABLE "enrollments"
      ADD CONSTRAINT "enrollments_gradeStatusCodeId_fkey"
      FOREIGN KEY ("gradeStatusCodeId") REFERENCES "grade_status_codes"("id") ON DELETE SET NULL;
  END IF;
END $$;
