ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "addDropStartDate" timestamp;
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "addDropEndDate" timestamp;
