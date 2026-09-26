-- ════════════════════════════════════════════════════════════════════════
-- 0032 — چنددانشگاهی: universityId برای ۵ جدول جامانده از 0016/0023
-- ────────────────────────────────────────────────────────────────────────
--  این ۵ جدول در schema.ts ستون universityId دارند ولی در DB ندارند
--  (در هیچ مهاجرت‌ای ALTER نشده‌اند): grade_thresholds، equivalence_clusters،
--  course_exam_sessions، notification_logs، virtual_class_recordings.
--  الگو همان 0023: ADD COLUMN → FK → backfill.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "grade_thresholds" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "grade_thresholds" ADD CONSTRAINT "grade_thresholds_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "grade_thresholds" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "equivalence_clusters" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "equivalence_clusters" ADD CONSTRAINT "equivalence_clusters_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "equivalence_clusters" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "course_exam_sessions" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "course_exam_sessions" ADD CONSTRAINT "course_exam_sessions_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "course_exam_sessions" ces SET "universityId" = co."universityId" FROM "course_offerings" co WHERE ces."courseOfferingId" = co."id" AND ces."universityId" IS NULL AND co."universityId" IS NOT NULL;
--> statement-breakpoint
UPDATE "course_exam_sessions" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "notification_logs" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "virtual_class_recordings" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "virtual_class_recordings" ADD CONSTRAINT "virtual_class_recordings_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "virtual_class_recordings" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;
